// the user-drawn box on the filter-by-location map
let box;
const boxColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--bs-info');

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

    const mapContainer = map.getContainer();
    mapContainer.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            setFilter();
            const form = mapContainer.closest('form');
            if (form) {
                form.submit();
            }
        }
    });

    return map;
}

function createExtentMap(n, e, s, w, height = '300px', width) {
    $('#map').height(height);
    if (width) {
        $('#map').width(width);
    }
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

function copyCitation() {
    const text = $('#citation').text();
    navigator.clipboard.writeText(text).then(function () {
        flashTooltip('copy-citation-btn', 'Copied!');
    });
}

function getSelectedIds() {
    const checkboxes = document.querySelectorAll('input[name="check_item"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

function buildRedirectUrl(selectedIds) {
//    const baseUrl = 'http://odp.localhost:2022/catalog/subset';
    const currentUrl = new URL(window.location.href);
    // Replace the path with '/subset'
    const baseUrl = `${currentUrl.origin}/catalog/subset`
    page = 1
    size = 50
    const queryParams = selectedIds.map(id => `record_id_or_doi_list=${id}`).join('&');
    return `${baseUrl}?${queryParams}&page=${page}&size=${size}`;
}

function goToSelectedRecordList(event) {
    event.preventDefault();
    const selectedIds = getSelectedIds();
    console.log("Selected IDs:", selectedIds);
    const redirectUrl = buildRedirectUrl(selectedIds);
    console.log("Redirect URL:", redirectUrl);
    window.location.href = redirectUrl;
}

function selectedRecordListLink(event) {
    event.preventDefault();
    const selectedIds = getSelectedIds();
    console.log("Selected IDs:", selectedIds);
    const redirectUrl = buildRedirectUrl(selectedIds);
    console.log("Redirect URL:", redirectUrl);
    document.getElementById('record-subsetilink').innerText = redirectUrl;
}



  function toggleSelectAll(selectAllCheckbox) {
    const checkboxes = document.querySelectorAll('input[name="check_item"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
    });
}

function toggleUnSelectAll() {
    const checkboxes = document.querySelectorAll('input[name="check_item"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
}


//  function copyToClipboard() {
//    const copyText = document.getElementById('record-subsetilink').innerText;
//    const textarea = document.createElement('textarea');
//    textarea.value = copyText;
//    document.body.appendChild(textarea);
//    textarea.select();
//    document.execCommand('copy');
//    document.body.removeChild(textarea);
//    alert("Copied the text: " + copyText);
//}
