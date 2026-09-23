"""Train offline, export a portable forest, and publish the JSON atomically.

No database access. The label is the supplied risk_level, not observed failures.
"""
import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

ROOT = Path(__file__).resolve().parent
CATEGORICAL = ['category', 'condition', 'status', 'priority']
BASE_NUMERIC = ['useful_life_years', 'purchase_cost', 'work_orders_count',
                'downtime_minutes', 'labor_hours', 'asset_age_years', 'days_to_warranty_expiry']
DERIVED = ['useful_life_consumed_ratio', 'is_warranty_expired',
           'avg_downtime_per_wo', 'avg_labor_per_wo', 'annual_maintenance_frequency']
NUMERIC = BASE_NUMERIC + DERIVED
PARAMETERS = dict(n_estimators=100, random_state=42, n_jobs=1, max_depth=12, min_samples_leaf=2)


def validate_and_transform(df):
    required = ['asset_id', 'risk_level'] + CATEGORICAL + BASE_NUMERIC
    missing = sorted(set(required) - set(df.columns))
    if missing:
        raise ValueError(f'Missing dataset columns: {missing}')
    if df[required].isna().any().any():
        raise ValueError('Required dataset values cannot be empty')
    if df.asset_id.duplicated().any():
        raise ValueError('Duplicate asset_id values could leak across train/test sets')
    if set(df.risk_level) != {'Low', 'Medium', 'High'}:
        raise ValueError('risk_level must contain Low, Medium and High classes')
    if df.risk_level.value_counts().min() < 5:
        raise ValueError('Each class needs at least five examples')
    x = df[CATEGORICAL + BASE_NUMERIC].copy()
    for col in CATEGORICAL:
        x[col] = x[col].astype(str).str.strip()
        if (x[col] == '').any():
            raise ValueError(f'{col} cannot be blank')
    for col in BASE_NUMERIC:
        x[col] = pd.to_numeric(x[col], errors='raise')
        if not np.isfinite(x[col]).all():
            raise ValueError(f'{col} must be finite')
        if col != 'days_to_warranty_expiry' and (x[col] < 0).any():
            raise ValueError(f'{col} cannot be negative')
    if (x.useful_life_years <= 0).any():
        raise ValueError('useful_life_years must be positive')
    if (x.work_orders_count % 1 != 0).any():
        raise ValueError('work_orders_count must be an integer')
    # Recompute derived fields identically at training and inference time.
    count = x.work_orders_count.replace(0, np.nan)
    age = x.asset_age_years.replace(0, np.nan)
    x['useful_life_consumed_ratio'] = x.asset_age_years / x.useful_life_years
    x['is_warranty_expired'] = (x.days_to_warranty_expiry < 0).astype(int)
    x['avg_downtime_per_wo'] = (x.downtime_minutes / count).fillna(0)
    x['avg_labor_per_wo'] = (x.labor_hours / count).fillna(0)
    x['annual_maintenance_frequency'] = (x.work_orders_count / age).fillna(0)
    return x[CATEGORICAL + NUMERIC]


def atomic_json(file, payload):
    temporary = file.with_suffix(file.suffix + '.tmp')
    temporary.write_text(json.dumps(payload, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    os.replace(temporary, file)


def train(dataset, output):
    df = pd.read_csv(dataset)
    x = validate_and_transform(df)
    y = df.risk_level
    x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.2, random_state=42, stratify=y)
    pipeline = Pipeline([
        ('preprocessor', ColumnTransformer([
            ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False), CATEGORICAL),
            ('num', 'passthrough', NUMERIC)
        ])),
        ('classifier', RandomForestClassifier(**PARAMETERS))
    ])
    pipeline.fit(x_train, y_train)
    forest = pipeline.named_steps['classifier']
    categories = pipeline.named_steps['preprocessor'].named_transformers_['cat'].categories_
    prediction = pipeline.predict(x_test)
    digest = hashlib.sha256(dataset.read_bytes()).hexdigest()
    version_input = digest + json.dumps(PARAMETERS, sort_keys=True) + sklearn.__version__ + 'features-v1'
    version = hashlib.sha256(version_input.encode()).hexdigest()[:16]
    report = classification_report(y_test, prediction, output_dict=True, zero_division=0)
    metadata = {
        'version': version, 'trainedAt': datetime.now(timezone.utc).isoformat(),
        'algorithm': 'RandomForestClassifier', 'featureSchemaVersion': 1,
        'datasetSha256': digest, 'datasetRows': len(df),
        'trainingRows': len(x_train), 'testRows': len(x_test), 'randomSeed': 42,
        'classCounts': {str(k): int(v) for k, v in y.value_counts().items()},
        'accuracy': float(accuracy_score(y_test, prediction)),
        'majorityBaselineAccuracy': float(y_test.value_counts().max() / len(y_test)),
        'macroF1': float(report['macro avg']['f1-score']), 'classificationReport': report,
        'confusionMatrix': confusion_matrix(y_test, prediction, labels=forest.classes_).tolist(),
        'confusionMatrixLabels': forest.classes_.tolist(), 'sklearnVersion': sklearn.__version__,
        'evaluation': 'Stratified random 80/20 holdout; exported model fitted on training rows only.',
        'limitation': 'Predicts supplied risk labels. Dataset provenance and real-world failure calibration are unverified.'
    }
    trees = []
    for estimator in forest.estimators_:
        tree = estimator.tree_
        values = tree.value[:, 0, :]
        probabilities = values / values.sum(axis=1, keepdims=True)
        trees.append({'left': tree.children_left.tolist(), 'right': tree.children_right.tolist(),
                      'feature': tree.feature.tolist(), 'threshold': tree.threshold.tolist(),
                      'probabilities': probabilities.tolist()})
    artifact = {
        'formatVersion': 1, 'metadata': metadata, 'classes': forest.classes_.tolist(),
        'categoricalFeatures': CATEGORICAL, 'numericFeatures': NUMERIC,
        'categories': {name: values.tolist() for name, values in zip(CATEGORICAL, categories)},
        'numericRanges': {name: {'min': float(x_train[name].min()), 'max': float(x_train[name].max())} for name in BASE_NUMERIC},
        'trees': trees
    }
    output.mkdir(parents=True, exist_ok=True)
    # Compare Node inference to sklearn on every row, not only handpicked examples.
    fixtures = [{'features': row[CATEGORICAL + BASE_NUMERIC].to_dict(),
                 'probabilities': probs.tolist(), 'riskLevel': str(label)}
                for (_, row), probs, label in zip(x.iterrows(), pipeline.predict_proba(x), pipeline.predict(x))]
    atomic_json(output / 'risk-model-parity.json', {'version': version, 'classes': forest.classes_.tolist(), 'cases': fixtures})
    atomic_json(output / 'risk-model-metrics.json', metadata)
    joblib.dump(pipeline, output / 'smart_asset_risk_model.pkl')
    atomic_json(output / 'risk-model.json', artifact)
    print(json.dumps({'status': 'completed', **metadata}, allow_nan=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--dataset', type=Path, default=ROOT / 'smart_asset_final_dataset.csv')
    parser.add_argument('--output-dir', type=Path, default=ROOT)
    args = parser.parse_args()
    train(args.dataset.resolve(), args.output_dir.resolve())
