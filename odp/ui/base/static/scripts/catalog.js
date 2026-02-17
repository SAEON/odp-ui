let box;
const boxColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--bs-info');

let downloadModalInstance;
let downloadModalElement;
let submitDownloadBtn;
let submitDownloadLoader;
let downloadAuditForm;

let downloadContext = {
    recordsToDownload: [], buttonElement: null
};

const DOWNLOAD_CACHE_KEY = 'mims_download_cache';
const CACHE_EXPIRY_DAYS = 30;

function getDownloadCache() {
    const cached = localStorage.getItem(DOWNLOAD_CACHE_KEY);
    if (!cached) return null;

    try {
        const data = JSON.parse(cached);
        // Check if cache has expired
        if (data.timestamp && (Date.now() - data.timestamp > CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)) {
            localStorage.removeItem(DOWNLOAD_CACHE_KEY);
            return null;
        }
        return data;
    } catch (e) {
        console.warn('Failed to parse download cache:', e);
        return null;
    }
}

function saveDownloadCache(name, email, organisation) {
    try {
        const cacheData = {
            name: name, email: email, organisation: organisation, timestamp: Date.now()
        };
        localStorage.setItem(DOWNLOAD_CACHE_KEY, JSON.stringify(cacheData));
    } catch (e) {
        console.warn('Failed to save download cache:', e);
    }
}

function populateDownloadFormFromCache(nameFieldId, emailFieldId, organisationFieldId) {
    const cache = getDownloadCache();
    if (!cache) return;

    const nameField = document.getElementById(nameFieldId);
    const emailField = document.getElementById(emailFieldId);
    const organisationField = document.getElementById(organisationFieldId);

    if (nameField && cache.name) {
        nameField.value = cache.name;
    }
    if (emailField && cache.email) {
        emailField.value = cache.email;
    }
    if (organisationField && cache.organisation) {
        organisationField.value = cache.organisation;
    }
}

function _initMap(n, e, s, w) {
    let lat = -33;
    let lon = 23;
    if (n && e && s && w) {
        lat = (n + s) / 2;
        lon = (e + w) / 2;
    }
    const map = L.map('map', {
        center: [lat, lon], zoom: 3, gestureHandling: true, gestureHandlingOptions: {
            duration: 1500
        }
    });
    L.tileLayer.provider('Esri.WorldStreetMap').addTo(map);
    L.control.scale({
        metric: true, imperial: false
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
            animate: false, maxZoom: 9
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
            polyline: false, polygon: false, marker: false, circle: false, circlemarker: false
        }, edit: {
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
            animate: false, maxZoom: 9
        });
    }

    map.on(L.Draw.Event.CREATED, function (event) {
        box = event.layer;
        drawnItems.addLayer(box);
    });

    map.on(L.Draw.Event.DELETED, function () {
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
            url: `https://doi.org/${doi}`, dataType: 'text', headers: {
                Accept: `text/x-bibliography; locale=en-GB; style=${style}`
            }, success: function (result) {
                $('#citation').html(result);
                localStorage.setItem('citation-style', style);
            }
        });
    }
}

function copyCitation() {
    const text = $('#citation').text();
    navigator.clipboard.writeText(text).then(function () {
        const tooltip = new bootstrap.Tooltip($('#copy-citation-btn'), {
            title: 'Copied!', trigger: 'manual'
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

function handleShareClick(buttonElement) {
    const cb = buttonElement.previousElementSibling;   // first child is the <input>
    if (cb?.type === 'checkbox') cb.checked = true;
}

function downloadSelectedRecords(event, buttonEl, recordId) {
    event.preventDefault();
    event.stopPropagation();

    try {
        const selectedIds = recordId !== '' ? [recordId] : getSelectedIds();
        if (selectedIds.length === 0) {
            alert('Please select one or more records to download.');
            return;
        }

        if (selectedIds.length > 0) {
            // Store context for the modal's submit handler
            downloadContext.recordsToDownload = selectedIds;
            downloadContext.buttonElement = buttonEl; // Store the button

            // Reset form and show modal
            if (downloadAuditForm) downloadAuditForm.reset();

            const disclaimerCheckbox = document.getElementById('disclaimer-acknowledgment');

            if (disclaimerCheckbox) {
                disclaimerCheckbox.checked = false;
            }

            if (submitDownloadBtn) {
                submitDownloadBtn.disabled = true;
            }

            // Populate form with cached values if available
            populateDownloadFormFromCache('download-name', 'download-email', 'organisation');

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

    // Get form inputs
    const nameInput = document.getElementById('download-name');
    const emailInput = document.getElementById('download-email');
    const organisationInput = document.getElementById('organisation');

    submitDownloadBtn.disabled = true;
    submitDownloadLoader.style.display = 'inline-block';

    // Save to cache for future downloads
    saveDownloadCache(nameInput.value, emailInput.value, organisationInput.value);

    // Perform ZIP download with user data (server handles audit logging automatically)
    const userData = {
        name: nameInput.value.trim(), email: emailInput.value.trim(), organisation: organisationInput.value.trim()
    };

    await _performZipDownload(downloadContext.buttonElement, downloadContext.recordsToDownload, userData);

    submitDownloadBtn.disabled = false;
    submitDownloadLoader.style.display = 'none';
    downloadModalInstance.hide();

    downloadContext = {
        recordsToDownload: [], buttonElement: null
    };
}

async function _performZipDownload(buttonEl, selectedRecords, userData) {
    const loader = buttonEl.querySelector('.download-loader');
    if (loader) loader.style.display = 'inline-block';

    try {

        if (selectedRecords.length === 0) {
            throw new Error('No valid record IDs found');
        }

        // Call server-side ZIP generation endpoint
        const response = await fetch('/catalog/generate-zip-bundle', {
            method: 'POST', headers: {
                'Content-Type': 'application/json',
            }, body: JSON.stringify({
                record_ids: selectedRecords, user_data: userData
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server error: ${response.status} - ${errorText}`);
        }

        // Get ZIP blob from response
        const zipBlob = await response.blob();

        // Trigger download
        const a = document.createElement('a');
        a.href = URL.createObjectURL(zipBlob);
        a.download = 'records.zip';
        a.click();
        URL.revokeObjectURL(a.href);

    } catch (err) {
        console.error("Download failed:", err);
        alert("Failed to download records. Please try again.");
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

function createAndDisplayLink(event) {
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

function initCatalogUI() {
    initDownloadCheckboxes();
    initDownloadModal();
}

function initDownloadCheckboxes() {
    const itemCheckboxes = document.querySelectorAll('input[name="check_item"]');
    if (itemCheckboxes.length > 0) {
        updateButtonStates();
        itemCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', updateButtonStates);
        });
    }
}

function initDownloadModal() {
    downloadModalElement = document.getElementById('download-audit-modal');
    if (!downloadModalElement) return;

    downloadModalInstance = new bootstrap.Modal(downloadModalElement);
    submitDownloadBtn = document.getElementById('submit-download-btn');
    submitDownloadLoader = submitDownloadBtn?.querySelector('.submit-download-loader');
    downloadAuditForm = document.getElementById('download-audit-form');

    const disclaimerCheckbox = document.getElementById('disclaimer-acknowledgment');
    if (disclaimerCheckbox && submitDownloadBtn) {
        disclaimerCheckbox.addEventListener('change', function () {
            submitDownloadBtn.disabled = !this.checked;
        });
    }

    if (submitDownloadBtn) {
        submitDownloadBtn.addEventListener('click', handleSubmitAndPerformDownload);
    }
}

document.addEventListener('DOMContentLoaded', initCatalogUI);
