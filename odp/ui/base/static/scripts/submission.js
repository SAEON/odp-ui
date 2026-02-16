$(document).ready(() => {
    setMap();

    initSelect2Fields(['keywords', 'instruments', 'eov_keywords', 'ecv_keywords']);

    $(document).on('blur', 'input[id$="-orcid"]', function () {
        populateOrcidInfo($(this))
    });

    $(document).on('blur', 'input[id$="-ror"]', function () {
        populateRORInfo($(this))
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

function populateOrcidInfo(orcidInput) {
    let rawValue = orcidInput.val().trim();

    if (rawValue === "") return;

    // Matches the ID at the end of the URL or on its own
    const idMatch = rawValue.match(/(\d{4}-){3}\d{3}[\dX]$/);

    if (idMatch) {
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
                    $(`#${baseId}affiliation`).val(employment.organization.name).trigger('change');
                }
                orcidInput.removeClass('is-invalid').addClass('is-valid');
            },
            error: function () {
                orcidInput.addClass('is-invalid');
            },
            complete: function () {
                orcidInput.removeClass('is-loading');
            }
        });
    } else {
        orcidInput.addClass('is-invalid');
    }
}

function populateRORInfo(rorInput) {
    let rawValue = rorInput.val().trim();

    if (rawValue === "") return;

    const idMatch = rawValue.match(/([a-z0-9]{9})$/);

    if (idMatch) {
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
                    $(`#${baseId}affiliation`).val(institutionName).trigger('change');
                }

                rorInput.removeClass('is-invalid').addClass('is-valid');
            },
            error: function () {
                rorInput.addClass('is-invalid');
            },
            complete: function () {
                rorInput.removeClass('is-loading');
            }
        });
    } else {
        rorInput.addClass('is-invalid');
    }
}

function setMap() {
    $('#map').height('300px');

    const $n = $('#bounding_box-north_bound_latitude');
    const $e = $('#bounding_box-east_bound_longitude');
    const $s = $('#bounding_box-south_bound_latitude');
    const $w = $('#bounding_box-west_bound_longitude');

    const n = parseFloat($n.val());
    const e = parseFloat($e.val());
    const s = parseFloat($s.val());
    const w = parseFloat($w.val());

    const map = _initMap(n, e, s, w);

    const drawnItems = new L.FeatureGroup();

    const drawControl = new L.Control.Draw({
        draw: {
            polyline: false,
            polygon: false,
            marker: false,
            circle: false,
            circlemarker: false,
            rectangle: true
        },
        edit: false
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

    map.on(L.Draw.Event.CREATED, function (event) {
        drawnItems.clearLayers();

        const layer = event.layer;
        const bounds = layer.getBounds();

        $n.val(bounds.getNorth());
        $e.val(bounds.getEast());
        $s.val(bounds.getSouth());
        $w.val(bounds.getWest());

        drawnItems.addLayer(layer);
    });
}