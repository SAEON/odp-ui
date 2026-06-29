function initCheckAll() {
    $('#check-all').prop('indeterminate', false);

    let checkedAll = false;
    const checkedCount = $('input:checked[id^="check-item-"]').length;

    if (checkedCount > 0) {
        const itemCount = $('input[id^="check-item-"]').length;
        if (checkedCount < itemCount) {
            $('#check-all').prop('indeterminate', true);
        } else {
            checkedAll = true;
        }
    }

    $('#check-all').prop('checked', checkedAll);
    $('label[for="check-all"]').text(`Select ${checkedAll ? 'none' : 'all'}`);
}

function checkAll() {
    const checked = $('#check-all').is(':checked');
    $('input[id^="check-item-"]').prop('checked', checked);
    $('label[for="check-all"]').text(`Select ${checked ? 'none' : 'all'}`);
}

function checkItem() {
    initCheckAll();
}

function appendFieldListEntry(fieldListName) {
    const fieldListRowWrapper = document.getElementById(`field_list_wrapper_${fieldListName}`);
    const originalFieldListRow = document.getElementById(`field_list_row_${fieldListName}-0`);
    const clonedFieldListRow = originalFieldListRow.cloneNode(true);
    const entries = clonedFieldListRow.querySelectorAll('.form-control');

    entries.forEach((entry, index) => {
        entry.classList.remove('is-invalid');
        entry.value = '';
    });

    fieldListRowWrapper.appendChild(clonedFieldListRow);
    reIndexFieldList(fieldListName);
}

function removeFieldListEntry(buttonElement, fieldListName) {
    const fieldListRow = buttonElement.closest('.field_list_row');
    fieldListRow.parentNode.removeChild(fieldListRow);
    reIndexFieldList(fieldListName);
}

function reIndexFieldList(fieldListName) {
    const fieldListWrapper = document.getElementById(`field_list_wrapper_${fieldListName}`);
    const fieldListSubforms = fieldListWrapper.querySelectorAll('.subform-wrapper');

    if (fieldListSubforms.length > 0) {
        fieldListSubforms.forEach((subform, index) => {
            replaceInputNamesWithIndexedName(subform, index);
        });
    } else {
        const fieldListRows = fieldListWrapper.querySelectorAll('.row');

        fieldListRows.forEach((fieldListRow, index) => {
            replaceInputNamesWithIndexedName(fieldListRow, index);
            fieldListRow.id = `field_list_row_${fieldListName}-${index}`;
        })
    }
}

function replaceInputNamesWithIndexedName(parentElement, index) {
    const regex = /\d/;
    const formControls = parentElement.querySelectorAll('.form-control');

    formControls.forEach((formControl) => {
        formControl.name = formControl.name.replace(regex, index);
        formControl.id = formControl.id.replace(regex, index);
    });
}



