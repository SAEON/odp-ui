$(document).ready(() => {
    setMap();

    setupLicenseFields();

    initSelect2Fields(['keywords', 'instruments', 'eov_keywords', 'ecv_keywords', 'ebv_keywords', 'eav_keywords', 'place_keywords']);

    $(document).on('blur', 'input[id$="-orcid"]', function () {
        populateOrcidInfo($(this))
    });

    $(document).on('blur', 'input[id$="-ror"]', function () {
        populateRORInfo($(this))
    });

    flatpickr('input[type="date"]', {
        dateFormat: "Y-m-d",
        allowInput: true
    });
});

function initSelect2Fields(elementIds) {
    elementIds.forEach(id => {
        const $el = $(`#${id}`);

        if ($el.length > 0) {
            $el.select2();
        }
    });
}


function setupLicenseFields() {
    const licenseSelect = document.getElementById('license-license');
    const embargoReasonField = document.getElementById('license-embargo_reason');
    const licenseOtherText = document.getElementById('license-other_text');

    if (licenseSelect && embargoReasonField && licenseOtherText) {
        const embargoReasonRow = embargoReasonField.closest('.col-12') ?? embargoReasonField.closest('.subform-row');
        const licenseOtherTextRow = licenseOtherText.closest('.col-12') ?? licenseOtherText.closest('.subform-row');

        function toggleTextFields() {
            embargoReasonRow.style.display = (licenseSelect.value === 'Embargo') ? '' : 'none';
            licenseOtherTextRow.style.display = (licenseSelect.value === 'Other') ? '' : 'none';
        }

        licenseSelect.addEventListener('change', toggleTextFields);
        toggleTextFields();
    }
}

function showError(inputElement, message) {
    inputElement.removeClass('is-valid').addClass('is-invalid');

    let feedback = inputElement.siblings('.invalid-feedback');
    if (feedback.length === 0) {
        feedback = $('<div class="invalid-feedback"></div>').insertAfter(inputElement);
    }
    feedback.text(message);
}

function clearError(inputElement) {
    inputElement.removeClass('is-invalid');
    inputElement.siblings('.invalid-feedback').text('');
}

function populateOrcidInfo(orcidInput) {
    let rawValue = orcidInput.val().trim();

    if (rawValue === "") {
        clearError(orcidInput);
        orcidInput.removeClass('is-valid');
        return;
    }

    const idMatch = rawValue.match(/(\d{4}-){3}\d{3}[\dX]$/);

    if (idMatch) {
        clearError(orcidInput); // Clear format error if regex passes
        const orcidId = idMatch[0];
        const fullUrl = `https://orcid.org/${orcidId}`;

        orcidInput.val(fullUrl);
        orcidInput.addClass('is-loading');
        const baseId = orcidInput.attr('id').replace('orcid', '');

        $.ajax({
            url: `/submissions/orcid/${orcidId}`,
            method: 'GET',
            success: function (data) {
                if (data.person?.name) {
                    $(`#${baseId}first_name`).val(data.person.name['given-names']?.value || '').trigger('change');
                    $(`#${baseId}last_name`).val(data.person.name['family-name']?.value || '').trigger('change');
                }
                const employment = data['activities-summary']?.employments?.['employment-summary']?.[0];
                if (employment) {
                    $(`#${baseId}affiliation_name`).val(employment.organization.name).trigger('change');
                }
                orcidInput.addClass('is-valid');
            },
            error: function (xhr) {
                let errorMsg = 'Failed to fetch ORCID profile. Please fill in details manually.';
                if (xhr.status === 404) {
                    errorMsg = 'ORCID record not found. Please check the identifier.';
                }
                showError(orcidInput, errorMsg);
            },
            complete: function () {
                orcidInput.removeClass('is-loading');
            }
        });
    } else {
        showError(orcidInput, 'Invalid ORCID format. Expected format: 0000-0000-0000-0000');
    }
}

function populateRORInfo(rorInput) {
    let rawValue = rorInput.val().trim();

    if (rawValue === "") {
        clearError(rorInput);
        rorInput.removeClass('is-valid');
        return;
    }

    const idMatch = rawValue.match(/([a-z0-9]{9})$/);

    if (idMatch) {
        clearError(rorInput); // Clear format error if regex passes
        const rorId = idMatch[0];
        const fullUrl = `https://ror.org/${rorId}`;

        rorInput.val(fullUrl);
        rorInput.addClass('is-loading');

        const baseId = rorInput.attr('id').replace('ror', '');

        $.ajax({
            url: `https://api.ror.org/v2/organizations/${fullUrl}`,
            method: 'GET',
            success: function (data) {
                const displayNameObj = data.names.find(n => n.types.includes('ror_display'));
                const institutionName = displayNameObj ? displayNameObj.value : '';

                if (institutionName) {
                    $(`#${baseId}affiliation_name`).val(institutionName).trigger('change');
                }

                rorInput.addClass('is-valid');
            },
            error: function (xhr) {
                let errorMsg = 'Failed to fetch ROR details. Please fill in details manually.';
                if (xhr.status === 404) {
                    errorMsg = 'ROR organization record not found.';
                }
                showError(rorInput, errorMsg);
            },
            complete: function () {
                rorInput.removeClass('is-loading');
            }
        });
    } else {
        showError(rorInput, 'Invalid ROR ID. Expected a 9-character ID or full ROR URL.');
    }
}

function setMap() {
    $('#map').height('300px');

    const $n = $('#geographic_extent-north_bound_latitude');
    const $e = $('#geographic_extent-east_bound_longitude');
    const $s = $('#geographic_extent-south_bound_latitude');
    const $w = $('#geographic_extent-west_bound_longitude');

    const $p_lat = $('#geographic_extent-point_latitude');
    const $p_lon = $('#geographic_extent-point_longitude');

    const n = parseFloat($n.val());
    const e = parseFloat($e.val());
    const s = parseFloat($s.val());
    const w = parseFloat($w.val());

    const p_lat = parseFloat($p_lat.val());
    const p_lon = parseFloat($p_lon.val());

    const map = _initMap(n, e, s, w);

    const drawnItems = new L.FeatureGroup();

    const drawControl = new L.Control.Draw({
        draw: {
            polyline: false,
            polygon: false,
            marker: true,
            circle: false,
            circlemarker: false,
            rectangle: true
        },
        edit: {
            featureGroup: drawnItems,
            remove: true
        }
    });
    map.addLayer(drawnItems);
    map.addControl(drawControl);

    if (n && e && s && w) {
        const bounds = [[n, e], [s, w]];
        const box = L.rectangle(bounds, {
            color: typeof boxColor !== 'undefined' ? boxColor : '#3388ff'
        });
        drawnItems.addLayer(box);
        map.fitBounds(bounds, {
            animate: false,
            maxZoom: 9
        });
    }

    if (!isNaN(p_lat) && !isNaN(p_lon)) {
        const marker = L.marker([p_lat, p_lon]);
        drawnItems.addLayer(marker);

        if (!(n && e && s && w)) {
            map.setView([p_lat, p_lon], 9);
        }
    }

    function syncInputsToMap() {
        $n.val('');
        $e.val('');
        $s.val('');
        $w.val('');
        $p_lat.val('');
        $p_lon.val('');

        drawnItems.eachLayer(function (layer) {
            if (layer instanceof L.Marker) {
                const latlng = layer.getLatLng();
                $p_lat.val(latlng.lat);
                $p_lon.val(latlng.lng);
            } else if (layer instanceof L.Rectangle) {
                const bounds = layer.getBounds();
                $n.val(bounds.getNorth());
                $e.val(bounds.getEast());
                $s.val(bounds.getSouth());
                $w.val(bounds.getWest());
            }
        });
    }

    map.on(L.Draw.Event.CREATED, function (event) {
        const layer = event.layer;
        drawnItems.eachLayer(function (existingLayer) {
            if (layer instanceof L.Marker && existingLayer instanceof L.Marker) {
                drawnItems.removeLayer(existingLayer);
            } else if (layer instanceof L.Rectangle && existingLayer instanceof L.Rectangle) {
                drawnItems.removeLayer(existingLayer);
            }
        });

        drawnItems.addLayer(layer);
        syncInputsToMap();
    });

    map.on(L.Draw.Event.EDITED, function (event) {
        syncInputsToMap();
    });

    map.on(L.Draw.Event.DELETED, function (event) {
        syncInputsToMap();
    });
}