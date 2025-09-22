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
    const selectedRecords = [];

    checkboxes.forEach(cb => {
        // Find the closest parent div that contains the checkbox and the link
        const container = cb.closest('.col-md-4');
        if (container) {
            const downloadLink = container.querySelector('a[href*="/download"]');
            selectedRecords.push({
                id: cb.value,
                link: downloadLink ? downloadLink.href : null
            });
        }
    });

    console.log(selectedRecords)

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

function goToSelectedRecordList(event,records) {
    event.preventDefault();
    const selectedIds = getSelectedIds(records);
    // console.log("--Selected IDs:", selectedIds,records);
    const redirectUrl = buildRedirectUrl(selectedIds);
    // console.log("Redirect URL:", redirectUrl);
    window.location.href = redirectUrl;
}

function selectedRecordListLink(event,buttonEl) {
    event.preventDefault();

    const selectedIds = getSelectedIds();

    const redirectUrl = buildRedirectUrl(selectedIds);
    console.log("Redirect URL:", redirectUrl);
    document.getElementById('record-subsetilink').innerText = redirectUrl;
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

async function downloadSelectedRecords(event, buttonEl, record_id) {
    event.preventDefault();

    // Show loader
    const loader = buttonEl.querySelector('.download-loader');
    if (loader) loader.style.display = 'inline-block';

    try {
        console.log("R.id: ", record_id, ":");
        const records = JSON.parse(buttonEl.getAttribute('data-records'));

        const selectedIds = record_id !== '' ? [record_id] : getSelectedIds();
        console.log("Selected IDs:", selectedIds);

        const selectedRecords = records.filter(record => selectedIds.includes(record.id));
        console.log("Selected Records:", selectedRecords);

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
                    headers: {
                        'Content-Type': 'application/json'
                    },
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

        const content = await zip.generateAsync({ type: 'blob' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = 'Records.zip';
        a.click();

    } catch (err) {
        console.error("Download failed:", err);
        alert("Failed to download records. Please try again.");
    } finally {
        // Hide loader
        if (loader) loader.style.display = 'none';
    }
}


function createAndDisplayLink(event, button) {
                // This function acts as a bridge to the existing selectedRecordListLink,
                // but ensures the output is directed to our new input field.
                // It temporarily renames the target input to what the old function expects.
                const targetInput = document.getElementById('record-subset-link');
                const oldId = 'record-subsetilink';
                const oldElement = document.getElementById(oldId);

                // If an element with the old ID exists, we hide it to avoid confusion.
                if (oldElement) {
                    oldElement.style.display = 'none';
                }

                // The original selectedRecordListLink function expects a <p> tag with id 'record-subsetilink'
                // and sets its innerHTML. We'll create a temporary one for it to use.
                let tempP = document.createElement('p');
                tempP.id = oldId;
                tempP.style.display = 'none';
                document.body.appendChild(tempP);

                // Call the original function
                selectedRecordListLink(event, button);

                // The original function is likely asynchronous or has a delay.
                // We'll check for the result and update our input.
                setTimeout(() => {
                    if (tempP.innerHTML) {
                        // Assuming the link is plain text or inside an <a> tag.
                        const linkElement = tempP.querySelector('a');
                        if (linkElement) {
                            targetInput.value = linkElement.href;
                        } else {
                            targetInput.value = tempP.innerText;
                        }
                    }
                    document.body.removeChild(tempP); // Clean up the temporary element.
                }, 500); // Adjust delay if needed
            }

            function copyToClipboard(elementSelector) {
                const element = document.querySelector(elementSelector);
                if (element && element.value) {
                    navigator.clipboard.writeText(element.value).then(() => {
                        // Optional: give user feedback
                        const originalButtonText = document.querySelector(`${elementSelector} + button`).innerHTML;
                        document.querySelector(`${elementSelector} + button`).innerHTML = 'Copied!';
                        setTimeout(() => {
                            document.querySelector(`${elementSelector} + button`).innerHTML = originalButtonText;
                        }, 2000);
                    }).catch(err => {
                        console.error('Failed to copy text: ', err);
                    });
                }
            }

document.addEventListener('DOMContentLoaded', function() {
    updateButtonStates();
    const itemCheckboxes = document.querySelectorAll('input[name="check_item"]');
    itemCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateButtonStates);
    });
});
