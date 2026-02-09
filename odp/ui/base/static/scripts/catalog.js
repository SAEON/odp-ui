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

// Cache management for download form details
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
            name: name,
            email: email,
            organisation: organisation,
            timestamp: Date.now()
        };
        localStorage.setItem(DOWNLOAD_CACHE_KEY, JSON.stringify(cacheData));
    } catch (e) {
        console.warn('Failed to save download cache:', e);
    }
}

function clearDownloadCache() {
    localStorage.removeItem(DOWNLOAD_CACHE_KEY);
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

function selectedRecordListLink(event) {
    event.preventDefault();
    const selectedIds = getSelectedIds();
    const redirectUrl = buildRedirectUrl(selectedIds);
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
    const disclaimerCheckbox = document.getElementById('disclaimer-acknowledgment');

    // Validate all required fields
    if (!nameInput.value.trim()) {
        alert('Please enter your name.');
        nameInput.focus();
        return;
    }

    if (!emailInput.value.trim()) {
        alert('Please enter your email address.');
        emailInput.focus();
        return;
    }

    if (!isValidEmail(emailInput.value)) {
        alert('Please enter a valid email address.');
        emailInput.focus();
        return;
    }

    if (!organisationInput.value.trim()) {
        alert('Please enter your organisation.');
        organisationInput.focus();
        return;
    }

    // Check if disclaimer checkbox is checked
    if (!disclaimerCheckbox || !disclaimerCheckbox.checked) {
        alert('Please acknowledge the data usage terms before downloading.');
        if (disclaimerCheckbox) disclaimerCheckbox.focus();
        return;
    }

    submitDownloadBtn.disabled = true;
    submitDownloadLoader.style.display = 'inline-block';

    // Save to cache for future downloads
    saveDownloadCache(nameInput.value, emailInput.value, organisationInput.value);

    // Perform ZIP download with user data (server handles audit logging automatically)
    const userData = {
        name: nameInput.value.trim(),
        email: emailInput.value.trim(),
        organisation: organisationInput.value.trim()
    };

    await _performZipDownload(
        downloadContext.buttonElement,
        downloadContext.recordsToDownload,
        userData
    );

    submitDownloadBtn.disabled = false;
    submitDownloadLoader.style.display = 'none';
    downloadModalInstance.hide();

    downloadContext = {
        recordsToDownload: [],
        buttonElement: null
    };
}

async function _performZipDownload(buttonEl, selectedRecords, userData) {
    const loader = buttonEl.querySelector('.download-loader');
    if (loader) loader.style.display = 'inline-block';

    try {
        // Prepare record IDs (DOIs or UUIDs)
        const recordIds = selectedRecords
            .map(record => record.doi || record.id)
            .filter(id => id);

        if (recordIds.length === 0) {
            throw new Error('No valid record IDs found');
        }

        // Call server-side ZIP generation endpoint
        const response = await fetch('/catalog/generate-zip-bundle', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                record_ids: recordIds,
                user_data: userData
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

function isValidEmail(email) {
    // Regular expression for email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function updateDownloadButtonState() {
    const downloadBtn = document.getElementById('download-btn');
    const acknowledgeCheckbox = document.getElementById('accept-terms-of-use-popup');

    if (downloadBtn && acknowledgeCheckbox) {
        downloadBtn.disabled = !acknowledgeCheckbox.checked;
    }
}

function handleSingleRecordDownload(downloadUrl, doi) {
    const nameInput = document.getElementById('download-popup-name');
    const emailInput = document.getElementById('download-popup-email');
    const organisationInput = document.getElementById('download-popup-organisation');
    const acknowledgeCheckbox = document.getElementById('accept-terms-of-use-popup');

    // Validate all required fields
    if (!nameInput.value.trim()) {
        alert('Please enter your name.');
        nameInput.focus();
        return;
    }

    if (!emailInput.value.trim()) {
        alert('Please enter your email address.');
        emailInput.focus();
        return;
    }

    if (!isValidEmail(emailInput.value)) {
        alert('Please enter a valid email address.');
        emailInput.focus();
        return;
    }

    if (!organisationInput.value.trim()) {
        alert('Please enter your organisation.');
        organisationInput.focus();
        return;
    }

    // Validate that acknowledgment checkbox is checked
    if (!acknowledgeCheckbox || !acknowledgeCheckbox.checked) {
        alert('Please acknowledge the data usage terms before downloading.');
        if (acknowledgeCheckbox) acknowledgeCheckbox.focus();
        return;
    }

    const name = nameInput.value;
    const email = emailInput.value;
    const organisation = organisationInput.value;

    // Save to cache for future downloads
    saveDownloadCache(name, email, organisation);

    // Log audit data
    const payload = {
        download_url: downloadUrl,
        file_size: null,
        success: true,
        name: name || null,
        email: email || null,
        organisation: organisation || null,
        doi: doi || '10.15493/DEA.MIMS.15202023',
        meta: {
            source: 'MIMS-UI-Detail-Page',
            download_type: 'single_record'
        }
    };

    fetch('/catalog/download-audit', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
    }).catch(err => console.error('Audit log failed:', err));

    // Perform the download
    window.open(downloadUrl);

    // Close the modal
    const downloadModal = bootstrap.Modal.getInstance(document.getElementById('download-popup'));
    if (downloadModal) downloadModal.hide();
}

function openSingleDownloadModal(downloadUrl, doi, recordId) {
    // 1. Get the modal submit button
    const submitBtn = document.getElementById('download-btn');

    if (submitBtn) {
        // 2. dynamically set the onclick to call the existing handler with THIS record's data
        submitBtn.setAttribute('onclick', `handleSingleRecordDownload('${downloadUrl}', '${doi}', '${recordId}')`);

        // 3. Reset button state
        submitBtn.disabled = true;
    }

    // 4. Reset and populate form fields (using your existing cache function)
    const checkbox = document.getElementById('accept-terms-of-use-popup');
    if (checkbox) checkbox.checked = false;

    populateDownloadFormFromCache('download-popup-name', 'download-popup-email', 'download-popup-organisation');

    // 5. Show the modal
    const modalEl = document.getElementById('download-popup');
    if (modalEl) {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
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

    // Add event listener for the download popup acknowledgment checkbox
    const downloadPopupAcknowledgeCheckbox = document.getElementById('accept-terms-of-use-popup');
    if (downloadPopupAcknowledgeCheckbox) {
        downloadPopupAcknowledgeCheckbox.addEventListener('change', updateDownloadButtonState);
    }

    // Add event listener for single record download modal to populate cache
    const downloadPopupModal = document.getElementById('download-popup');
    if (downloadPopupModal) {
        downloadPopupModal.addEventListener('show.bs.modal', function () {
            // Populate form with cached values when modal is about to show
            populateDownloadFormFromCache('download-popup-name', 'download-popup-email', 'download-popup-organisation');
        });
    }
});