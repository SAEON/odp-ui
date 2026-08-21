const rootPath = (function () {
    const currentPathname = window.location.pathname;
    const catalogIndex = currentPathname.indexOf('/catalog');
    return catalogIndex !== -1 ? currentPathname.substring(0, catalogIndex) : '';
})();

function showNotification(message, type = 'warning') {
    const container = document.querySelector('main .container, main, .container') || document.body;
    const div = document.createElement('div');
    div.className = `alert alert-${type} alert-dismissible fade show mt-2`;
    div.setAttribute('role', 'alert');
    div.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
    container.prepend(div);
    setTimeout(() => div.remove(), 5000);
}

// the user-drawn box on the filter-by-location map
let box;
const boxColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--bs-info');

let downloadModalInstance;
let downloadModalElement;
let submitDownloadBtn;
let downloadAuditForm;

const DOWNLOAD_CACHE_KEY = 'mims_download_cache';
const CACHE_EXPIRY_DAYS = 30;

function getDownloadCache() {
    const cached = localStorage.getItem(DOWNLOAD_CACHE_KEY);
    if (!cached) return null;

    try {
        const data = JSON.parse(cached);
        if (data.timestamp && (Date.now() - data.timestamp > CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)) {
            localStorage.removeItem(DOWNLOAD_CACHE_KEY);
            return null;
        }
        return data;
    } catch (e) {
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
        // Silently fail if cache cannot be saved
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
    const catalogIndex = currentUrl.pathname.indexOf('/catalog');
    const basePath = currentUrl.pathname.substring(0, catalogIndex + 8);
    const baseUrl = `${currentUrl.origin}${basePath}/subset`;
    const queryParams = selectedIds.map(id => `record_id_or_doi_list=${id}`).join('&');
    return `${baseUrl}?${queryParams}&page=1&size=50`;
}

function goToSelectedRecordList(event, records) {
    event.preventDefault();
    const selectedIds = getSelectedIds(records);
    const redirectUrl = buildRedirectUrl(selectedIds);
    window.location.href = redirectUrl;
}

function updateButtonStates() {
    const checkboxes = document.querySelectorAll('input[name="check_item"]:checked');
    const downloadSelectedBtn = document.getElementById('download-selected-btn');

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
    const cb = buttonElement.previousElementSibling;
    if (cb?.type === 'checkbox') cb.checked = true;
}

function downloadSelectedRecords(event, _buttonEl, recordId, downloadUrl = null) {
    event.preventDefault();
    event.stopPropagation();

    try {
        const selectedIds = recordId !== '' ? [recordId] : getSelectedIds();
        if (selectedIds.length === 0) {
            showNotification('Please select one or more records to download.');
            return;
        }

        if (downloadAuditForm) {
            downloadAuditForm.reset();

            downloadAuditForm.querySelectorAll('input[name="record_ids"]').forEach(el => el.remove());
            downloadAuditForm.querySelectorAll('input[name="download_url"]').forEach(el => el.remove());

            selectedIds.forEach(id => {
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = 'record_ids';
                input.value = id;
                downloadAuditForm.appendChild(input);
            });

            if (downloadUrl) {
                const urlInput = document.createElement('input');
                urlInput.type = 'hidden';
                urlInput.name = 'download_url';
                urlInput.value = downloadUrl;
                urlInput.id = 'dynamic-download-url';
                downloadAuditForm.appendChild(urlInput);
            }
        }

        if (submitDownloadBtn) submitDownloadBtn.disabled = false;
        const loader = submitDownloadBtn?.querySelector('.submit-download-loader');
        if (loader) loader.style.display = 'none';

        populateDownloadFormFromCache('download-name', 'download-email', 'organisation');
        if (downloadModalInstance) downloadModalInstance.show();

    } catch {
        showNotification('An error occurred. Please try again.', 'danger');
    }
}

function createAndDisplayLink(event) {
    event.preventDefault();
    const targetInput = document.getElementById('record-subset-link');
    if (!targetInput) {
        showNotification('An error occurred while generating the link.', 'danger');
        return;
    }

    const selectedIds = getSelectedIds();
    if (selectedIds.length === 0) {
        showNotification('Please select at least one record.');
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
        }).catch(() => {
            showNotification('Failed to copy text. Please try manually.');
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
    downloadAuditForm = document.getElementById('download-audit-form');

    const disclaimerCheckbox = document.getElementById('disclaimer-acknowledgment');
    if (disclaimerCheckbox && submitDownloadBtn) {
        disclaimerCheckbox.addEventListener('change', function () {
            submitDownloadBtn.disabled = !this.checked;
        });
    }

    if (downloadAuditForm) {
        downloadAuditForm.addEventListener('submit', function (e) {
            e.preventDefault();

            const urlInput = document.getElementById('dynamic-download-url');

            if (urlInput && urlInput.value) {
                // Open the Somisana link in a new tab
                window.open(urlInput.value, '_blank');

                // Hide modal and reset form
                if (downloadModalInstance) downloadModalInstance.hide();
            } else {


                const nameField = document.getElementById('download-name');
                const emailField = document.getElementById('download-email');
                const orgField = document.getElementById('organisation');

                const name = nameField.value.trim();
                const email = emailField.value.trim();
                const organisation = orgField.value.trim();

                // Reset previous validation state
                [nameField, emailField, orgField].forEach(f => f.classList.remove('is-invalid'));
                document.getElementById('error-name').textContent = '';
                document.getElementById('error-email').textContent = '';
                document.getElementById('error-organisation').textContent = '';

                let valid = true;
                if (!name) {
                    nameField.classList.add('is-invalid');
                    document.getElementById('error-name').textContent = 'Name is required.';
                    valid = false;
                }
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!email) {
                    emailField.classList.add('is-invalid');
                    document.getElementById('error-email').textContent = 'Email is required.';
                    valid = false;
                } else if (!emailRegex.test(email)) {
                    emailField.classList.add('is-invalid');
                    document.getElementById('error-email').textContent = 'Please enter a valid email address.';
                    valid = false;
                }
                if (!organisation) {
                    orgField.classList.add('is-invalid');
                    document.getElementById('error-organisation').textContent = 'Organisation is required.';
                    valid = false;
                }
                if (!valid) return;

                saveDownloadCache(name, email, organisation);

                const recordIds = [...downloadAuditForm.querySelectorAll('input[name="record_ids"]')]
                    .map(i => i.value);

                localStorage.setItem('odp-download-request', JSON.stringify({
                    recordIds,
                    userData: {name, email, organisation},
                }));

                const popup = window.open(
                    rootPath + '/catalog/download-progress',
                    'odp-download',
                    'width=520,height=200,resizable=yes,scrollbars=no'
                );

                downloadModalInstance.hide();

                if (!popup) {
                    localStorage.removeItem('odp-download-request');
                    showNotification('Please allow popups for this site to enable downloads, then try again.', 'warning');
                }
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', initCatalogUI);
