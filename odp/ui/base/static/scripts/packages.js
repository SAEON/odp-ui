function initResourcesPopup() {
    $('#resources-popup').on('show.bs.modal', function () {
        $('input[id^="check-"]').prop('checked', false);
        $('#check-all').prop('indeterminate', false);
        $('#no-results').addClass('visually-hidden');

        const providerId = $('#provider_id').val();
        if (providerId) {
            $('#resource_provider_id').val(providerId);
        }
    });
}

function fetchResources() {
    /* Fetch resource records from the app server and populate the modal. */
    const providerId = $('#resource_provider_id').val();
    const includePackaged = $('#include_packaged').is(':checked');
    const url = `${rootPath}/packages/fetch-resources/${providerId}?${includePackaged ? 'include_packaged=1' : ''}`;

    $.getJSON(url)
        .done(function (result) {
            const tbody = $('<tbody id="resources-table-body">');
            if (result.total > 0) {
                for (let i = 0; i < result.items.length; i++) {
                    let row = $('<tr>');
                    let resource = result.items[i];
                    let resourceCheck = $(`<input class="form-check-input" type="checkbox" value=""
                                            id="check-item-${resource.id}" onchange="checkItem();">`);
                    resourceCheck.data(resource);
                    row.append($('<td>').append(resourceCheck));
                    row.append($('<td>').text(resource.title));
                    row.append($('<td>').text(resource.filename));
                    row.append($('<td>').text(resource.size));
                    row.append($('<td>').text(resource.mimetype));
                    row.append($('<td>').text(Object.keys(resource.archive_paths)));
                    tbody.append(row);
                }
                $('#no-results').addClass('visually-hidden');
            } else {
                $('#no-results').removeClass('visually-hidden');
            }
            $('#resources-table-body').replaceWith(tbody);
        })
        .fail(function (jqxhr, textStatus, error) {
            alert(`${textStatus}: ${error}`)
        })
}

function addResources() {
    /* Add checked resources in the modal to the resources multiselect form control. */
    const checkedResources = $('input:checked[id^="check-item-"]');
    if (checkedResources.length > 0) {
        const resourceSelect = $('#resource_ids');
        checkedResources.each(function () {
            let resource = $(this).data();
            // only add if not already present in the multiselect
            if ($(`input[value="${resource.id}"]`).length === 0) {
                let li = $('<li>');
                let checkbox = $(`<input type="checkbox" checked name="resource_ids" id="${resource.id}" value="${resource.id}">`);
                let label = $(`<label for="${resource.id}">`);
                label.text(`${resource.title} [${resource.filename} | ${resource.size} | ${resource.mimetype}]`);
                li.append(checkbox);
                li.append(' ');
                li.append(label);
                resourceSelect.append(li);
            }
        });
        flashTooltip('add-resources-btn', 'Added!');
    } else {
        flashTooltip('add-resources-btn', 'No resources selected');
    }
}

function toggleAuthor() {
    const isAuthor = $('#is_author').is(':checked');
    if (isAuthor) {
        $('#author_role_grp').removeClass('visually-hidden');
        $('#contributor_role_grp').addClass('visually-hidden');
    } else {
        $('#author_role_grp').addClass('visually-hidden');
        $('#contributor_role_grp').removeClass('visually-hidden');
    }
}
