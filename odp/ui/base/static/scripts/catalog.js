// the user-drawn box on the filter-by-location map
let box;
const boxColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--bs-info');

// Validate email format
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
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
    // const checkboxes = document.querySelectorAll('input[name="check_item"]:checked');
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
    console.log("Selected  list IDs :--", selectedIds,'------------',);

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

function handleShareClick(buttonElement) {
    const cb = buttonElement.previousElementSibling;   // first child is the <input>
    if (cb?.type === 'checkbox') cb.checked = true;
}

async function downloadSelectedRecords(event, buttonEl,record_id) {
    event.preventDefault();

    console.log("R.id: ",record_id,":")
    const records = JSON.parse(buttonEl.getAttribute('data-records'));

    // if record_id is not an empty string, use it; otherwise call getSelectedIds()
    const selectedIds = record_id !== '' ? [record_id] : getSelectedIds();

    // const selectedIds = getSelectedIds();
    console.log("Selected IDs:", selectedIds);

    // Filter records based on selectedIds
    const selectedRecords = records.filter(record => selectedIds.includes(record.id));
    console.log("Selected Records:", selectedRecords);

    const zip = new JSZip();

    for (const record of selectedRecords) {
        const metadataRecord = record.metadata_records?.[0];
        if (!metadataRecord) continue;

        const metadata = metadataRecord.metadata;
        const title = metadata.titles?.[0]?.title?.replace(/[<>:"/\\|?*]+/g, '_') || 'Untitled';
        const folder = zip.folder(title);

        // Add metadata as PDF via backend
        try {
            const response = await fetch('/catalog/format/metadata.pdf', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify([record])  // Send single record in array
            });

            if (!response.ok) throw new Error("Failed to generate PDF");

            const pdfBlob = await response.blob();
            folder.file('metadata.pdf', pdfBlob);
        } catch (err) {
            console.error("Error generating metadata PDF:", err);
            // fallback to plain text metadata
            folder.file('metadata.txt', JSON.stringify(metadata, null, 2));
        }

        // Add downloadable file if available
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

    // Generate and trigger download
    zip.generateAsync({ type: 'blob' }).then(content => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = 'Records.zip';
        a.click();
    });
}

function openDownloadModal(btn) {
  const downloadUrl = btn.getAttribute('data-download-url');
  const recordId = btn.getAttribute('data-record-id') || '';
  const doi = btn.getAttribute('data-doi') || '';
  // fill form fields...
  document.getElementById('da-download-url').value = downloadUrl;
  document.getElementById('da-record-id').value = recordId;
  document.getElementById('da-doi').value = doi;
  // reset optional fields...
  // show modal...
  attachDownloadAuditHandlers();
}

function attachDownloadAuditHandlers() {
  const form = document.getElementById('download-audit-form');
  if (!form) return;
  if (form.__download_handlers_attached) return;
  form.__download_handlers_attached = true;

  const nameInput = document.getElementById('da-name');
  const emailInput = document.getElementById('da-email');
  const organisationInput = document.getElementById('da-reason');
  const acceptCheckbox = document.getElementById('da-accept-terms');
  const submit = document.getElementById('da-submit');

  // Update submit button state based on all validations
  function updateSubmitState() {
    const hasName = nameInput.value.trim() !== '';
    const hasEmail = emailInput.value.trim() !== '';
    const hasOrganisation = organisationInput.value.trim() !== '';
    const acceptsTerms = acceptCheckbox.checked;
    submit.disabled = !(hasName && hasEmail && hasOrganisation && acceptsTerms);
  }

  // Add event listeners for real-time validation feedback
  nameInput.addEventListener('change', updateSubmitState);
  emailInput.addEventListener('change', updateSubmitState);
  organisationInput.addEventListener('change', updateSubmitState);
  acceptCheckbox.addEventListener('change', updateSubmitState);

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();

    // Validate all fields before submission
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
    if (!acceptCheckbox.checked) {
      alert('Please acknowledge the data usage terms before downloading.');
      acceptCheckbox.focus();
      return;
    }

    submit.disabled = true;

    const payload = {
      record_id: document.getElementById('da-record-id').value || null,
      doi: document.getElementById('da-doi').value || null,
      download_url: document.getElementById('da-download-url').value || null,
      name: nameInput.value,
      email: emailInput.value,
      reason: organisationInput.value,
      success: true,
      meta: {}
    };

    fetch('/download/audit', {   // FastAPI route prefix: /download/audit
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
        // add CSRF header if needed
      },
      body: JSON.stringify(payload),
      credentials: 'same-origin'
    }).then(function (resp) {
      if (!resp.ok) return resp.json().then(j => { throw new Error(j.detail || 'Failed to record download');});
      return resp.json();
    }).then(function (json) {
      // hide modal then open download link
      const modalEl = document.getElementById('download-popup');
      bootstrap.Modal.getInstance(modalEl).hide();
      if (payload.download_url) {
        window.open(payload.download_url, '_blank');
      } else {
        console.warn('No download_url provided');
      }
    }).catch(function (err) {
      submit.disabled = false;
      const feedback = document.getElementById('da-feedback');
      feedback.style.display = 'block';
      feedback.textContent = err.message || 'Failed to record download';
    });
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
