import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'src' / 'model'))
from train_risk_model import validate_and_transform


class DatasetValidation(unittest.TestCase):
    def setUp(self):
        self.df = pd.read_csv(ROOT / 'src' / 'model' / 'smart_asset_final_dataset.csv')

    def test_valid_data_and_recomputed_features(self):
        self.df.loc[0, 'useful_life_consumed_ratio'] = -100
        x = validate_and_transform(self.df)
        self.assertEqual(x.shape, (1000, 16))
        self.assertAlmostEqual(x.loc[0, 'useful_life_consumed_ratio'], 9.55 / 10)

    def test_missing_fields_and_duplicate_ids(self):
        with self.assertRaisesRegex(ValueError, 'Missing'):
            validate_and_transform(self.df.drop(columns=['labor_hours']))
        self.df.loc[1, 'asset_id'] = self.df.loc[0, 'asset_id']
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            validate_and_transform(self.df)

    def test_invalid_numbers_and_unknown_labels(self):
        self.df.loc[0, 'purchase_cost'] = -1
        with self.assertRaisesRegex(ValueError, 'negative'):
            validate_and_transform(self.df)
        self.df.loc[0, 'purchase_cost'] = 100
        self.df.loc[0, 'risk_level'] = 'Unknown'
        with self.assertRaisesRegex(ValueError, 'risk_level'):
            validate_and_transform(self.df)

    def test_zero_age_and_no_work_orders_produce_finite_features(self):
        self.df.loc[0, ['asset_age_years', 'work_orders_count']] = 0
        x = validate_and_transform(self.df)
        self.assertTrue(np.isfinite(x.select_dtypes(include='number')).all().all())
        self.assertEqual(x.loc[0, 'annual_maintenance_frequency'], 0)
        self.assertEqual(x.loc[0, 'avg_downtime_per_wo'], 0)


if __name__ == '__main__':
    unittest.main()
