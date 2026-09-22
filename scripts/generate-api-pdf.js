const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const tempHtml = path.join(root, 'docs', '.assethub-api-integration.html');
const outputPdf = path.join(root, 'docs', 'assethub-api-integration.pdf');
const edgeCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
const edge = edgeCandidates.find(candidate => fs.existsSync(candidate));
if (!edge) throw new Error('Microsoft Edge was not found.');

const escapeHtml = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = value => escapeHtml(value).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const html = [];
  let inCode = false;
  let code = [];
  let inList = false;
  let inTable = false;

  const closeList = () => { if (inList) { html.push('</ul>'); inList = false; } };
  const closeTable = () => { if (inTable) { html.push('</tbody></table>'); inTable = false; } };

  for (const line of lines) {
    if (line.startsWith('```')) {
      closeList(); closeTable();
      if (inCode) { html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); code = []; }
      inCode = !inCode;
      continue;
    }
    if (inCode) { code.push(line); continue; }
    if (!line.trim()) { closeList(); closeTable(); continue; }
    if (/^\|?\s*:?-{3,}/.test(line)) continue;
    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
      if (!inTable) { closeList(); html.push('<table><thead><tr>' + cells.map(cell => `<th>${inline(cell)}</th>`).join('') + '</tr></thead><tbody>'); inTable = true; }
      else html.push('<tr>' + cells.map(cell => `<td>${inline(cell)}</td>`).join('') + '</tr>');
      continue;
    }
    closeTable();
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) { closeList(); const level = heading[1].length; html.push(`<h${level}>${inline(heading[2])}</h${level}>`); continue; }
    if (/^[-*]\s+/.test(line)) { if (!inList) { html.push('<ul>'); inList = true; } html.push(`<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`); continue; }
    if (/^\d+\.\s+/.test(line)) { if (!inList) { html.push('<ul>'); inList = true; } html.push(`<li>${inline(line.replace(/^\d+\.\s+/, ''))}</li>`); continue; }
    html.push(`<p>${inline(line)}</p>`);
  }
  closeList(); closeTable();
  return html.join('\n');
}

const integration = fs.readFileSync(path.join(root, 'docs', 'frontend-integration.md'), 'utf8');
const reference = fs.readFileSync(path.join(root, 'docs', 'api-reference.md'), 'utf8');
const documentHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4; margin: 18mm 16mm; }
body { font-family: "Segoe UI", Arial, sans-serif; color: #1f2937; font-size: 10pt; line-height: 1.45; }
h1 { color: #123b5d; border-bottom: 2px solid #2d8a8a; padding-bottom: 6px; page-break-before: always; }
h1:first-of-type { page-break-before: auto; }
h2 { color: #155e75; margin-top: 20px; }
h3 { color: #374151; }
p { margin: 6px 0; }
code { font-family: Consolas, monospace; background: #eef4f5; padding: 1px 3px; }
pre { background: #f1f5f9; border-left: 4px solid #2d8a8a; padding: 10px; white-space: pre-wrap; font-size: 8pt; }
table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 8.5pt; }
th, td { border: 1px solid #cbd5e1; padding: 5px; vertical-align: top; }
th { background: #e2e8f0; }
li { margin: 3px 0; }
.cover { page-break-after: always; padding-top: 80px; }
.cover h1 { font-size: 28pt; border: 0; }
.cover p { font-size: 13pt; color: #475569; }
</style></head><body><section class="cover"><h1>AssetHub API</h1><p>Frontend Integration and Endpoint Reference</p><p>Generated ${new Date().toISOString().slice(0, 10)}</p><p>Base URL: <code>http://localhost:3000/api</code> or <code>https://assethub-backend.vercel.app/api</code></p></section>${markdownToHtml(integration)}${markdownToHtml(reference)}</body></html>`;
fs.writeFileSync(tempHtml, documentHtml);
execFileSync(edge, ['--headless', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${outputPdf}`, `file:///${tempHtml.replace(/\\/g, '/')}`], { stdio: 'inherit' });
fs.rmSync(tempHtml, { force: true });
console.log(`Created ${outputPdf}`);
