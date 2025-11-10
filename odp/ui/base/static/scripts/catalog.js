let box;
const boxColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--bs-info');

let downloadModalInstance;
let downloadModalElement;
let submitDownloadBtn;
let submitDownloadLoader;
let downloadAuditForm;

let downloadContext = {
    recordsToDownload: [],
    buttonElement: null
};


function _initMap(n, e, s, w) {
    let lat = -33;
    let lon = 23;
    if (n && e && s && w) {
        lat = (n + s) / 2;
        lon = (e + w) / 2;
    }
    const map = L.map('map', {
        center: [lat, lon],
        zoom: 3,
        gestureHandling: true,
        gestureHandlingOptions: {
            duration: 1500
        }
    });
    L.tileLayer.provider(
        'Esri.WorldStreetMap'
    ).addTo(map);
    L.control.scale({
        metric: true,
        imperial: false
    }).addTo(map);

    return map;
}

function createExtentMap(n, e, s, w) {
    $('#map').height('300px');
    const map = _initMap(n, e, s, w);

    if (n === s && e === w) {
        L.marker([n, e]).addTo(map);
    } else {
        const bounds = [[n, e], [s, w]];
        L.rectangle(bounds, {
            color: boxColor
        }).addTo(map);
        map.fitBounds(bounds, {
            animate: false,
            maxZoom: 9
        });
    }
}

function createFilterMap() {
    $('#map').height('300px');

    const n = parseFloat($('#n').val());
    const e = parseFloat($('#e').val());
    const s = parseFloat($('#s').val());
    const w = parseFloat($('#w').val());
    const map = _initMap(n, e, s, w);

    const drawnItems = new L.FeatureGroup();
    const drawControl = new L.Control.Draw({
        draw: {
            polyline: false,
            polygon: false,
            marker: false,
            circle: false,
            circlemarker: false
        },
        edit: {
            featureGroup: drawnItems
        }
    });
    map.addLayer(drawnItems);
    map.addControl(drawControl);

    if (n && e && s && w) {
        const bounds = [[n, e], [s, w]];
        box = L.rectangle(bounds, {
            color: boxColor
        });
        drawnItems.addLayer(box);
        map.fitBounds(bounds, {
            animate: false,
            maxZoom: 9
        });
    }

    map.on(L.Draw.Event.CREATED, function (event) {
        box = event.layer;
        drawnItems.addLayer(box);
    });

    map.on(L.Draw.Event.DELETED, function (event) {
        box = null;
    });
}

function initFilteredSearchProxy(defaultSort) {
    $('#q-proxy').keydown(function (e) {
        if (e.which === 13) {
            $('#q-proxy-btn').click();
        }
    });
    const sort = $('#sort-proxy').val();
    $('#sort').val(sort || defaultSort);
    $('#sort-proxy').val(sort || defaultSort);
}

function execFilteredSearchProxy() {
    const q = $('#q-proxy').val();
    const sort = $('#sort-proxy').val();
    $('#q').val(q);
    $('#sort').val(sort);
    $('#apply-filter').click();
}

function setFilter() {
    if (box) {
        const bounds = box.getBounds();
        $('#n').val(bounds.getNorth());
        $('#e').val(bounds.getEast());
        $('#s').val(bounds.getSouth());
        $('#w').val(bounds.getWest());
    } else {
        $('#n').val('');
        $('#e').val('');
        $('#s').val('');
        $('#w').val('');
    }
}

function clearFilter() {
    $('#n').val('');
    $('#e').val('');
    $('#s').val('');
    $('#w').val('');
    $('#after').val('');
    $('#before').val('');
    $('#exclusive_region').val('');
    $('#exclusive_interval').val('');
}

function initCitation(defaultStyle) {
    const style = localStorage.getItem('citation-style');
    $('#citation-style').val(style || defaultStyle);
}

let ris;

function setRIS(recordRIS) {
    ris = recordRIS;
}

function formatCitation(doi) {
    const style = $('#citation-style').val();
    if (style === 'ris') {
        $('#citation').html(ris);
        localStorage.setItem('citation-style', style);
    } else {
        $.ajax({
            url: `https://doi.org/${doi}`,
            dataType: 'text',
            headers: {
                Accept: `text/x-bibliography; locale=en-GB; style=${style}`
            },
            success: function (result) {
                $('#citation').html(result);
                localStorage.setItem('citation-style', style);
            }
        });
    }
}

function selectDataciteMetadata(record) {
    if (!record || !record.metadata_records) {
        return null;
    }
    const metadataRecord = record.metadata_records.find(mr => mr.schema_id === "SAEON.DataCite4");
    return metadataRecord ? metadataRecord.metadata : null;
}

function copyCitation() {
    const text = $('#citation').text();
    navigator.clipboard.writeText(text).then(function () {
        const tooltip = new bootstrap.Tooltip($('#copy-citation-btn'), {
            title: 'Copied!',
            trigger: 'manual'
        });
        tooltip.show();
        setTimeout(function () {
            tooltip.hide();
        }, 3000);
    });
}

function getSelectedIds() {
    const checkboxes = document.querySelectorAll('input[name="check_item"]:checked');

    return Array.from(checkboxes).map(cb => cb.value);
}

function buildRedirectUrl(selectedIds) {
    const currentUrl = new URL(window.location.href);
    const baseUrl = `${currentUrl.origin}/catalog/subset`
    page = 1
    size = 50
    const queryParams = selectedIds.map(id => `record_id_or_doi_list=${id}`).join('&');
    return `${baseUrl}?${queryParams}&page=${page}&size=${size}`;
}

function goToSelectedRecordList(event, records) {
    event.preventDefault();
    const selectedIds = getSelectedIds(records);
    const redirectUrl = buildRedirectUrl(selectedIds);
    window.location.href = redirectUrl;
}

function selectedRecordListLink(event, buttonEl) {
    event.preventDefault();
    const selectedIds = getSelectedIds();
    const redirectUrl = buildRedirectUrl(selectedIds);
    // document.getElementById('record-subsetilink').innerText = redirectUrl;
    const linkOutputElement = document.getElementById('record-subset-link-text') || document.getElementById('record-subsetilink');
    if (linkOutputElement) {
        linkOutputElement.innerText = redirectUrl;
    } else {
        console.error("Could not find element to display shareable link");
    }
}

function updateButtonStates() {
    const checkboxes = document.querySelectorAll('input[name="check_item"]:checked');
    const unselectAllCheckbox = document.getElementById('unselect_all');
    const downloadSelectedBtn = document.getElementById('download-selected-btn');

    if (unselectAllCheckbox) {
        unselectAllCheckbox.disabled = checkboxes.length === 0;
    }
    if (downloadSelectedBtn) {
        downloadSelectedBtn.disabled = checkboxes.length === 0;
    }
}

function toggleSelectAll(selectAllCheckbox) {
    const checkboxes = document.querySelectorAll('input[name="check_item"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
    });
    updateButtonStates();
}

function toggleUnSelectAll() {
    const checkboxes = document.querySelectorAll('input[name="check_item"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    const selectAllCheckbox = document.getElementById('select_all');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
    }
    updateButtonStates();
}

function handleShareClick(buttonElement) {
    const cb = buttonElement.previousElementSibling;   // first child is the <input>
    if (cb?.type === 'checkbox') cb.checked = true;
}

function downloadSelectedRecords(event, buttonEl, record_id) {
    event.preventDefault();
    event.stopPropagation();

    try {
        // Check if disclaimer checkbox exists and is checked
        const disclaimerCheckbox = document.getElementById('disclaimer-acknowledgment');
        if (disclaimerCheckbox && !disclaimerCheckbox.checked) {
            alert('Please acknowledge the data usage terms before downloading.');
            disclaimerCheckbox.focus();
            return;
        }

        const records = JSON.parse(buttonEl.getAttribute('data-records'));
        const selectedIds = record_id !== '' ? [record_id] : getSelectedIds();

        if (selectedIds.length === 0) {
            alert('Please select one or more records to download.');
            return;
        }

        const selectedRecords = records.filter(record => selectedIds.includes(record.id));

        if (selectedRecords.length > 0) {
            // Store context for the modal's submit handler
            downloadContext.recordsToDownload = selectedRecords;
            downloadContext.buttonElement = buttonEl; // Store the button

            // Reset form and show modal
            if (downloadAuditForm) downloadAuditForm.reset();
            if (downloadModalInstance) downloadModalInstance.show();
        } else {
            alert('No matching records found to download.');
        }

    } catch (err) {
        console.error("Failed to prepare download:", err);
        alert("An error occurred. Please try again.");
    }
}

async function handleSubmitAndPerformDownload(event) {
    event.preventDefault();

    submitDownloadBtn.disabled = true;
    submitDownloadLoader.style.display = 'inline-block';

    const name = document.getElementById('download-name').value;
    const email = document.getElementById('download-email').value;
    const organisation = document.getElementById('organisation').value;

    const doiList = [];
    const urlList = [];
    let totalFileSize = 0;

    for (const record of downloadContext.recordsToDownload) {
        const metadata = selectDataciteMetadata(record);

        if (record.id) {
            doiList.push(record.id);
        }

        let individualFileSize = null;
        if (metadata && metadata.immutableResource && metadata.immutableResource.resourceDownload) {
            const resource = metadata.immutableResource.resourceDownload;

            if (resource.downloadURL) {
                urlList.push(resource.downloadURL);
            }
            if (resource.resourceSize) {
                const size = parseInt(resource.resourceSize, 10);
                if (!isNaN(size)) {
                    totalFileSize += size;
                }
            }
        }
    }

    const payload = {
        download_url: 'client_generated_zip_bundle',
        file_size: totalFileSize > 0 ? totalFileSize : null,
        success: true, // Optimistic logging

        name: name || null,
        email: email || null,
        organisation: organisation || null,

        meta: {
            source: 'MIMS-UI',
            download_type: 'zip_bundle',
            record_count: downloadContext.recordsToDownload.length,
            dois: doiList,
            individual_urls: urlList
        }
    };

    fetch('/catalog/download-audit', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
    }).catch(err => console.error('Audit log failed:', err));

    await _performZipDownload(
        downloadContext.buttonElement,
        downloadContext.recordsToDownload
    );

    submitDownloadBtn.disabled = false;
    submitDownloadLoader.style.display = 'none';
    downloadModalInstance.hide();

    downloadContext = {
        recordsToDownload: [],
        buttonElement: null
    };
}

async function _performZipDownload(buttonEl, selectedRecords) {
    const loader = buttonEl.querySelector('.download-loader');
    if (loader) loader.style.display = 'inline-block';

    try {
        console.log("Selected Records for zipping:", selectedRecords);
        const zip = new JSZip();

        for (const record of selectedRecords) {
            const metadataRecord = record.metadata_records?.find(mr => mr.schema_id === "SAEON.DataCite4");
            if (!metadataRecord) continue;

            const metadata = metadataRecord.metadata;
            const title = metadata.titles?.[0]?.title?.replace(/[<>:"/\\|?*]+/g, '_') || 'Untitled';
            const folder = zip.folder(title);

            try {
                const response = await fetch('/catalog/format/metadata.pdf', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify([record])
                });
                if (!response.ok) throw new Error("Failed to generate PDF");
                const pdfBlob = await response.blob();
                folder.file('metadata.pdf', pdfBlob);
            } catch (err) {
                console.error("Error generating metadata PDF:", err);
                folder.file('metadata.txt', JSON.stringify(metadata, null, 2));
            }

            const downloadURL = metadata.immutableResource?.resourceDownload?.downloadURL + '/download';
            const fileName = metadata.immutableResource?.resourceDownload?.fileName || 'file';

            if (downloadURL) {
                try {
                    const proxyUrl = `/catalog/proxy-download?url=${encodeURIComponent(downloadURL)}`;
                    const response = await fetch(proxyUrl);
                    const blob = await response.blob();
                    const extension = blob.type.split('/')[1] || 'bin';
                    folder.file(`${fileName}.${extension}`, blob);
                } catch (err) {
                    console.error("Error downloading via proxy:", downloadURL, err);
                }
            }
        }

        const content = await zip.generateAsync({type: 'blob'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = 'Records.zip';
        a.click();

    } catch (err) {
        console.error("Download failed:", err);
        alert("Failed to download records. Please try again.");
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

function createAndDisplayLink(event, button) {
    event.preventDefault();
    const targetInput = document.getElementById('record-subset-link');
    if (!targetInput) {
        console.error("Missing target input 'record-subset-link'");
        return;
    }

    const selectedIds = getSelectedIds();
    if (selectedIds.length === 0) {
        alert("Please select at least one record.");
        return;
    }
    const redirectUrl = buildRedirectUrl(selectedIds);
    targetInput.value = redirectUrl;
}

function copyToClipboard(elementSelector) {
    const element = document.querySelector(elementSelector);
    if (element && element.value) {
        navigator.clipboard.writeText(element.value).then(() => {
            const copyButton = element.nextElementSibling;
            if (copyButton) {
                const originalText = copyButton.innerHTML;
                copyButton.innerHTML = 'Copied!';
                setTimeout(() => {
                    copyButton.innerHTML = originalText;
                }, 2000);
            }
        }).catch(err => {
            console.error('Failed to copy text: ', err);
        });
    }
}

document.addEventListener('DOMContentLoaded', function () {

    updateButtonStates();
    const itemCheckboxes = document.querySelectorAll('input[name="check_item"]');
    itemCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateButtonStates);
    });

    downloadModalElement = document.getElementById('download-audit-modal');
    if (downloadModalElement) {
        downloadModalInstance = new bootstrap.Modal(downloadModalElement);
        submitDownloadBtn = document.getElementById('submit-download-btn');
        submitDownloadLoader = submitDownloadBtn.querySelector('.submit-download-loader');
        downloadAuditForm = document.getElementById('download-audit-form');

        if (submitDownloadBtn) {
            submitDownloadBtn.addEventListener('click', handleSubmitAndPerformDownload);
        }
    }
});