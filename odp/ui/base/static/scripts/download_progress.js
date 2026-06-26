const bar = document.getElementById('download-bar');
const statusEl = document.getElementById('download-status');
const detailEl = document.getElementById('download-detail');
const pctEl = document.getElementById('download-pct');
const spinner = document.getElementById('status-spinner');

function setProgress(pct, label, detail) {
    const p = Math.round(pct);
    if (bar) { bar.style.width = p + '%'; bar.setAttribute('aria-valuenow', p); }
    if (pctEl) pctEl.textContent = p + '%';
    if (statusEl) statusEl.textContent = label;
    if (detailEl && detail !== undefined) detailEl.textContent = detail;
}

async function runDownload() {
    const req = JSON.parse(localStorage.getItem('odp-download-request') || 'null');
    if (!req) {
        setProgress(0, 'No download request found.', 'Close this tab and try again.');
        if (spinner) spinner.style.display = 'none';
        return;
    }
    localStorage.removeItem('odp-download-request');

    const { recordIds, userData } = req;

    try {
        setProgress(0, 'Preparing download…', '');
        const response = await fetch(rootPath + '/catalog/download-bundle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ record_ids: recordIds, user_data: userData }),
        });
        if (!response.ok) throw new Error(`Server error: ${response.status}`);
        const data = await response.json();

        const zip = new JSZip();
        const fileRange = 65;
        for (let i = 0; i < data.records.length; i++) {
            const rec = data.records[i];
            const folder = zip.folder(rec.folder_name);
            folder.file('Metadata.pdf', rec.metadata_pdf, { base64: true });

            setProgress(
                15 + fileRange * i / data.records.length,
                `Downloading file ${i + 1} of ${data.records.length}…`,
                rec.data_file_name || ''
            );

            if (rec.data_file_url) {
                let fileRes = null;
                try { fileRes = await fetch(rec.data_file_url + '/download'); } catch (_) { }
                if (!fileRes || !fileRes.ok) {
                    try {
                        fileRes = await fetch(
                            rootPath + '/catalog/proxy-download?url=' + encodeURIComponent(rec.data_file_url)
                        );
                    } catch (_) { }
                }
                if (fileRes && fileRes.ok) {
                    folder.file(rec.data_file_name, await fileRes.arrayBuffer());
                } else {
                    folder.file('data_file_unavailable.txt',
                        `The data file could not be downloaded.\n\nURL: ${rec.data_file_url}\n\nPlease try downloading it directly from the catalog record page.`
                    );
                }
            }
        }

        const blob = await zip.generateAsync(
            { type: 'blob', compression: 'STORE' },
            ({ percent }) => setProgress(80 + percent * 0.2, 'Assembling ZIP…', Math.round(percent) + '%')
        );

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'records.zip';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (bar) { bar.classList.remove('progress-bar-striped', 'progress-bar-animated'); bar.classList.add('bg-success'); }
        if (spinner) spinner.style.display = 'none';
        setProgress(100, '✓ Download complete!', 'You can close this tab.');
        if (pctEl) pctEl.textContent = '';

    } catch (err) {
        console.error('Download failed:', err);
        if (bar) { bar.classList.remove('progress-bar-striped', 'progress-bar-animated'); bar.classList.add('bg-danger'); }
        if (spinner) spinner.style.display = 'none';
        setProgress(0, '✗ Download failed.', 'Close this tab and try again.');
        if (pctEl) pctEl.textContent = '';
    }
}

window.addEventListener('load', runDownload);
