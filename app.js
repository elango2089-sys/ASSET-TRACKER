// --- INITIALIZATION & STATE MANAGEMENT --- //
const TOTAL_BINS = 400;

let state = {
    bins: {
        small: [], // Array of objects: { id: 'SGM-S-001', status: 'in_stock' | 'dispatched', location: 'Synergy' }
        big: []
    },
    dispatches: [], // Active and completed dispatches
    history: []     // All movements
};

// Initialize or Load State from Server
async function loadState() {
    let loadedSuccessfully = false;
    try {
        const response = await fetch('/api/state');
        if (response.ok) {
            state = await response.json();
            loadedSuccessfully = true;
        }
    } catch (error) {
        console.warn("Server not reached. Using local initialization/cache.", error);
    }

    // Initialization logic: if state is still empty (failed fetch or first run)
    if (state.bins.small.length === 0) {
        for (let i = 1; i <= TOTAL_BINS; i++) {
            const num = i.toString().padStart(3, '0');
            state.bins.small.push({ id: `SGM-S-${num}`, status: 'in_stock', location: 'Synergy' });
            state.bins.big.push({ id: `SGM-B-${num}`, status: 'in_stock', location: 'Synergy' });
        }
        
        // If we reached the server but it was empty, save the new bins
        if (loadedSuccessfully) {
            await saveState();
        }
    }
    
    updateDashboard();
    updateServerStatus(loadedSuccessfully);
}

function updateServerStatus(online) {
    const statusEl = document.getElementById('serverStatus');
    if (!statusEl) return;
    
    if (online) {
        statusEl.innerHTML = '<span class="badge success" style="background: #059669; color: white;">● Server Online</span>';
    } else {
        statusEl.innerHTML = '<span class="badge warning" style="background: #dc2626; color: white;">● Server Offline (Local mode)</span>';
    }
}

async function saveState() {
    try {
        await fetch('/api/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state)
        });
    } catch (error) {
        console.error("Failed to save state to server:", error);
    }
    updateDashboard();
}

function generateDCNumber() {
    const count = state.history.filter(h => h.type === 'DISPATCH').length + 1;
    return `SGM-ASS-${count.toString().padStart(3, '0')}`;
}

// --- UI & NAVIGATION --- //
document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();
    await loadState();
    
    // Timer
    setInterval(() => {
        document.getElementById('currentTime').textContent = new Date().toLocaleString('en-IN', {
            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute:'2-digit'
        });
    }, 1000);

    // Tab Navigation
    const tabs = document.querySelectorAll('.nav-btn');
    const views = document.querySelectorAll('.view');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            views.forEach(v => v.classList.remove('active'));
            
            tab.classList.add('active');
            let viewId = `view-${tab.dataset.tab}`;
            document.getElementById(viewId).classList.add('active');
            
            if(tab.dataset.tab === 'dispatch') populateDispatchView();
            if(tab.dataset.tab === 'return') populateReturnView();
            if(tab.dataset.tab === 'suppliers') populateSuppliersView();
            if(tab.dataset.tab === 'dashboard') updateDashboard();
            if(tab.dataset.tab === 'history') updateHistoryTable();
        });
    });

    // Close details modal
    document.getElementById('closeDetailsBtn').addEventListener('click', () => {
        document.getElementById('detailsModal').classList.add('hidden');
    });

    // Populate Supplier Datalist
    const supplierList = document.getElementById('supplierOptions');
    if (typeof SUPPIERS_LIST !== 'undefined') {
        SUPPIERS_LIST.forEach(sup => {
            let opt = document.createElement('option');
            opt.value = sup;
            supplierList.appendChild(opt);
        });
    }

    // Initialize Vehicle List
    initVehicles();

    // Set Default Date
    document.getElementById('dispatchDate').valueAsDate = new Date();

    // Export Excel
    document.getElementById('exportExcelBtn').addEventListener('click', exportToExcel);

    // Initial Render
    updateDashboard();
    populateDispatchView(); // Ensure bins are drawn after load
    initDispatchLogic();
    initReturnLogic();
    initSupplierLogic();
    // Auth Initialization
    initAuthLogic();
});

// --- DASHBOARD LOGIC --- //
function updateDashboard() {
    const smallOut = state.bins.small.filter(b => b.status === 'dispatched').length;
    const bigOut = state.bins.big.filter(b => b.status === 'dispatched').length;
    const totalOut = smallOut + bigOut;
    
    document.getElementById('statTotalSmall').textContent = TOTAL_BINS;
    document.getElementById('statTotalBig').textContent = TOTAL_BINS;
    document.getElementById('statCurrentlyOut').textContent = totalOut;
    document.getElementById('statInStock').textContent = (TOTAL_BINS * 2) - totalOut;

    // Render Outstanding Dispatches
    const tbody = document.querySelector('#outstandingTable tbody');
    tbody.innerHTML = '';
    
    const activeDispatches = state.dispatches.filter(d => d.status === 'ACTIVE');
    
    if (activeDispatches.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted)">No outstanding dispatches</td></tr>';
    } else {
        activeDispatches.forEach(d => {
            const tr = document.createElement('tr');
            const pendingCount = d.bins.length - d.returnedBins.length;
            tr.innerHTML = `
                <td>${d.date}</td>
                <td><span class="badge primary">${d.dcNumber}</span></td>
                <td>${d.supplier}</td>
                <td>${d.bins.length}</td>
                <td>${d.returnedBins.length}</td>
                <td><span class="badge warning">${pendingCount} Pending</span></td>
                <td>
                    <button class="btn btn-sm view-details-btn" data-id="${d.id}" style="padding: 6px 12px; font-size: 0.75rem; background: rgba(79, 70, 229, 0.2); color: #a5b4fc;">
                        <i data-lucide="eye" style="width: 14px; height: 14px;"></i> Details
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Add Listeners
        document.querySelectorAll('.view-details-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                showDispatchDetails(id);
            });
        });
        lucide.createIcons();
    }
}

function showDispatchDetails(id) {
    const dispatch = state.dispatches.find(d => d.id === id);
    if (!dispatch) return;

    const pendingBins = dispatch.bins.filter(b => !dispatch.returnedBins.includes(b));
    const returnedBins = dispatch.returnedBins;

    const contentArea = document.getElementById('detailsContent');
    contentArea.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
            <div><span style="color: #666; font-size: 0.875rem;">DC Number:</span><br><strong style="color: #000;">${dispatch.dcNumber}</strong></div>
            <div><span style="color: #666; font-size: 0.875rem;">Vehicle:</span><br><strong style="color: #000;">${dispatch.vehicle}</strong></div>
            <div style="grid-column: span 2;"><span style="color: #666; font-size: 0.875rem;">Supplier:</span><br><strong style="color: #000;">${dispatch.supplier}</strong></div>
            <div><span style="color: #666; font-size: 0.875rem;">Asset Type:</span><br><strong style="color: #000;">${dispatch.assetType} Bins</strong></div>
            <div><span style="color: #666; font-size: 0.875rem;">Date:</span><br><strong style="color: #000;">${dispatch.date}</strong></div>
        </div>

        <div style="margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <h4 style="font-size: 0.875rem; color: #b45309;">Pending Return (${pendingBins.length})</h4>
            </div>
            <div class="tags-container" style="background: #f8fafc; padding: 12px; border-radius: 8px; max-height: 150px; overflow-y: auto; border: 1px solid #e2e8f0;">
                ${pendingBins.length ? pendingBins.map(b => `<span class="tag" style="background: #fffbeb; color: #b45309; border-color: #fde68a;">${b.split('-').pop()}</span>`).join('') : '<span style="color: #94a3b8; font-size: 0.875rem;">No bins pending.</span>'}
            </div>
        </div>

        <div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <h4 style="font-size: 0.875rem; color: #047857;">Already Returned (${returnedBins.length})</h4>
            </div>
            <div class="tags-container" style="background: #f8fafc; padding: 12px; border-radius: 8px; max-height: 150px; overflow-y: auto; border: 1px solid #e2e8f0;">
                ${returnedBins.length ? returnedBins.map(b => `<span class="tag" style="background: #f0fdf4; color: #047857; border-color: #bcf0da;">${b.split('-').pop()}</span>`).join('') : '<span style="color: #94a3b8; font-size: 0.875rem;">No bins returned yet.</span>'}
            </div>
        </div>
    `;

    document.getElementById('detailsModal').classList.remove('hidden');
    lucide.createIcons();
}

// --- DISPATCH LOGIC --- //
let dispatchSelectedBins = new Set();

function initDispatchLogic() {
    // Start Preview instead of submitting
    document.getElementById('previewDispatchBtn').addEventListener('click', handleDispatchPreview);
    
    // Modal buttons
    document.getElementById('editDispatchBtn').addEventListener('click', () => {
        document.getElementById('previewModal').classList.add('hidden');
    });
    
    document.getElementById('confirmDispatchBtn').addEventListener('click', confirmAndGenerateDC);
    
    // Keyboard shortcuts
    window.addEventListener('keydown', handleKeyboardShortcuts);
}

function handleKeyboardShortcuts(e) {
    // Only trigger if we aren't typing in an input (except body)
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    // Ctrl + N = New Dispatch
    if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        document.querySelector('.nav-btn[data-tab="dispatch"]').click();
        document.getElementById('dispatchDate').focus();
    }
    
    // Ctrl + P = Print (if in a state where printing makes sense, or just generally handle custom logic)
    // Left native for now unless specifically hooked into a preview screen
}

function populateDispatchView() {
    // Re-render the bin selection whenever dispatch is opened
    dispatchSelectedBins.clear();
    renderBinsSection('small', 'smallBinsContainer');
    renderBinsSection('big', 'bigBinsContainer');
    updateSelectedBinsPreview();
}

function renderBinsSection(type, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    
    const availableBins = state.bins[type].filter(b => b.status === 'in_stock');

    if (availableBins.length === 0) {
        container.innerHTML = '<div style="color: #666; font-size: 0.8rem; padding: 10px;">None in stock</div>';
        return;
    }

    availableBins.forEach(bin => {
        const wrapper = document.createElement('div');
        wrapper.className = 'bin-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `checkbox-${bin.id}`;
        checkbox.value = bin.id;
        checkbox.className = 'bin-checkbox';
        
        const label = document.createElement('label');
        label.htmlFor = `checkbox-${bin.id}`;
        label.className = 'bin-label';
        label.textContent = bin.id.split('-').pop(); // Show only 001, 002 etc.
        
        checkbox.addEventListener('change', (e) => {
            if(e.target.checked) dispatchSelectedBins.add(bin.id);
            else dispatchSelectedBins.delete(bin.id);
            updateSelectedBinsPreview();
        });

        wrapper.appendChild(checkbox);
        wrapper.appendChild(label);
        container.appendChild(wrapper);
    });
}

function updateSelectedBinsPreview() {
    const countSpan = document.getElementById('selectedCount');
    const list = document.getElementById('selectedBinsList');
    
    countSpan.textContent = dispatchSelectedBins.size;
    list.innerHTML = '';
    
    Array.from(dispatchSelectedBins).sort().forEach(id => {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.innerHTML = `<i data-lucide="${id.includes('-S-') ? 'box' : 'package'}"></i> ${id}`;
        list.appendChild(tag);
    });
    lucide.createIcons();
}

function handleDispatchPreview() {
    const date = document.getElementById('dispatchDate').value;
    const supplier = document.getElementById('dispatchSupplier').value.trim();
    
    let vehicle = document.getElementById('vehicleSelect').value;
    if (vehicle === 'ADD_NEW') {
        vehicle = document.getElementById('vehicleNumberCustom').value.trim();
    }

    if (!date || !supplier || !vehicle) {
        // Trigger native form validation
        document.getElementById('dispatchForm').reportValidity();
        return;
    }

    if(dispatchSelectedBins.size === 0) {
        alert("Please select at least one bin to dispatch.");
        return;
    }

    const selectedBinsArr = Array.from(dispatchSelectedBins).sort();
    const smallBinsSelected = selectedBinsArr.filter(id => id.includes('-S-'));
    const bigBinsSelected = selectedBinsArr.filter(id => id.includes('-B-'));

    // Populate Modal
    const previewArea = document.getElementById('previewContent');
    previewArea.innerHTML = `
        <div style="background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; color: #000;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                <div><span style="color: #666; font-size: 0.875rem;">Date:</span><br><strong style="color: #000;">${date}</strong></div>
                <div><span style="color: #666; font-size: 0.875rem;">Vehicle:</span><br><strong style="color: #000;">${vehicle}</strong></div>
                <div style="grid-column: span 2;"><span style="color: #666; font-size: 0.875rem;">Supplier:</span><br><strong style="color: #000;">${supplier}</strong></div>
            </div>
            
            <div id="previewBinsBreakdown">
                ${smallBinsSelected.length ? `
                <div style="margin-bottom: 12px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
                    <span style="color: #444; font-size: 0.75rem; font-weight: 600; display: block; margin-bottom: 6px;">Small Bins (${smallBinsSelected.length})</span>
                    <div class="tags-container">
                        ${smallBinsSelected.map(id => `<span class="tag" style="background: #fff; border: 1px solid #e2e8f0; font-size: 0.7rem; color: #444;">${id.split('-').pop()}</span>`).join('')}
                    </div>
                </div>` : ''}
                
                ${bigBinsSelected.length ? `
                <div style="margin-bottom: 12px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
                    <span style="color: #444; font-size: 0.75rem; font-weight: 600; display: block; margin-bottom: 6px;">Big Bins (${bigBinsSelected.length})</span>
                    <div class="tags-container">
                        ${bigBinsSelected.map(id => `<span class="tag" style="background: #fff; border: 1px solid #e2e8f0; font-size: 0.7rem; color: #444;">${id.split('-').pop()}</span>`).join('')}
                    </div>
                </div>` : ''}
            </div>
        </div>
    `;

    document.getElementById('previewModal').classList.remove('hidden');
}

function confirmAndGenerateDC() {
    const date = document.getElementById('dispatchDate').value;
    const supplier = document.getElementById('dispatchSupplier').value.trim();
    
    let vehicle = document.getElementById('vehicleSelect').value;
    if (vehicle === 'ADD_NEW') {
        vehicle = document.getElementById('vehicleNumberCustom').value.trim();
    }
    const dcNumber = generateDCNumber();
    
    const selectedBinsArr = Array.from(dispatchSelectedBins).sort();
    const smallBinsSelected = selectedBinsArr.filter(id => id.includes('-S-'));
    const bigBinsSelected = selectedBinsArr.filter(id => id.includes('-B-'));
    
    // Update State
    state.bins.small.forEach(b => {
        if(dispatchSelectedBins.has(b.id)) {
            b.status = 'dispatched';
            b.location = supplier;
        }
    });
    state.bins.big.forEach(b => {
        if(dispatchSelectedBins.has(b.id)) {
            b.status = 'dispatched';
            b.location = supplier;
        }
    });

    let finalAssetType = 'Mixed';
    if (smallBinsSelected.length > 0 && bigBinsSelected.length === 0) finalAssetType = 'Small';
    else if (bigBinsSelected.length > 0 && smallBinsSelected.length === 0) finalAssetType = 'Big';

    const newDispatch = {
        id: Date.now().toString(),
        dcNumber, date, supplier, vehicle,
        bins: selectedBinsArr,
        assetType: finalAssetType,
        returnedBins: [],
        status: 'ACTIVE' // ACTIVE or COMPLETED
    };

    state.dispatches.unshift(newDispatch);
    
    state.history.unshift({
        id: Date.now().toString() + '-H',
        type: 'DISPATCH',
        dispatchId: newDispatch.id,
        date, dcNumber, supplier, vehicle,
        affectedBins: selectedBinsArr
    });

    saveState();
    
    // Hide Modal & Clean Form
    document.getElementById('previewModal').classList.add('hidden');
    document.getElementById('dispatchForm').reset();
    document.getElementById('dispatchDate').valueAsDate = new Date();
    dispatchSelectedBins.clear();
    populateDispatchView();
    
    // Go back to Dashboard
    document.querySelector('.nav-btn[data-tab="dashboard"]').click();

    // Show Print
    printDC(newDispatch);
}

// --- RETURN LOGIC --- //
let returnSelectedBins = new Set();
let currentReturnSupplier = null;

function initReturnLogic() {
    document.getElementById('returnSupplierSelect').addEventListener('change', (e) => {
        currentReturnSupplier = e.target.value;
        returnSelectedBins.clear();
        renderReturnDetails();
    });

    document.getElementById('previewReturnBtn').addEventListener('click', handleReturnPreview);
    
    document.getElementById('editReturnBtn').addEventListener('click', () => {
        document.getElementById('returnPreviewModal').classList.add('hidden');
    });

    document.getElementById('confirmReturnBtn').addEventListener('click', handleReturnSubmit);

    // Selection helpers
    document.getElementById('selectAllReturnBins').addEventListener('click', () => {
        const checkboxes = document.querySelectorAll('#pendingReturnBinsContainer .bin-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = true;
            returnSelectedBins.add(cb.value);
        });
    });

    document.getElementById('deselectAllReturnBins').addEventListener('click', () => {
        const checkboxes = document.querySelectorAll('#pendingReturnBinsContainer .bin-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = false;
            returnSelectedBins.delete(cb.value);
        });
    });
}

function populateReturnView() {
    const select = document.getElementById('returnSupplierSelect');
    select.innerHTML = '<option value="" disabled selected>Select a supplier with outstanding bins...</option>';
    
    // Find unique suppliers with active dispatches
    const activeSuppliers = [...new Set(
        state.dispatches
            .filter(d => d.status === 'ACTIVE')
            .map(d => d.supplier)
    )].sort();
    
    if(activeSuppliers.length === 0) {
        document.getElementById('returnDetailsArea').classList.add('hidden');
        return;
    }

    activeSuppliers.forEach(supplier => {
        const opt = document.createElement('option');
        opt.value = supplier;
        opt.textContent = supplier;
        select.appendChild(opt);
    });
}

function renderReturnDetails() {
    const detailsArea = document.getElementById('returnDetailsArea');
    if(!currentReturnSupplier) {
        detailsArea.classList.add('hidden');
        return;
    }
    
    detailsArea.classList.remove('hidden');
    const supplierDispatches = state.dispatches.filter(d => d.supplier === currentReturnSupplier && d.status === 'ACTIVE');
    
    let totalSent = 0;
    let totalReturned = 0;
    const allPendingBins = [];

    supplierDispatches.forEach(d => {
        totalSent += d.bins.length;
        totalReturned += d.returnedBins.length;
        const pending = d.bins.filter(b => !d.returnedBins.includes(b));
        allPendingBins.push(...pending);
    });

    const pendingCount = totalSent - totalReturned;
    
    document.getElementById('returnSummary').innerHTML = `
        <h4>Supplier: ${currentReturnSupplier}</h4>
        <p><strong>Total Outstanding Bins:</strong> <span class="badge warning">${pendingCount}</span></p>
        <p style="font-size: 0.8rem; color: #666;">Showing all bins from ${supplierDispatches.length} active dispatches</p>
    `;

    const container = document.getElementById('pendingReturnBinsContainer');
    container.innerHTML = '';
    
    allPendingBins.sort().forEach(binId => {
        const wrapper = document.createElement('div');
        wrapper.className = 'bin-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `ret-checkbox-${binId}`;
        checkbox.value = binId;
        checkbox.className = 'bin-checkbox';
        
        const label = document.createElement('label');
        label.htmlFor = `ret-checkbox-${binId}`;
        label.className = 'bin-label';
        label.textContent = binId;
        
        checkbox.addEventListener('change', (e) => {
            if(e.target.checked) returnSelectedBins.add(binId);
            else returnSelectedBins.delete(binId);
        });

        wrapper.appendChild(checkbox);
        wrapper.appendChild(label);
        container.appendChild(wrapper);
    });
}

function handleReturnPreview() {
    if(returnSelectedBins.size === 0) {
        alert("Please select at least one bin to return.");
        return;
    }

    const vehicle = document.getElementById('returnVehicleNumber').value.trim();
    if (!vehicle) {
        alert("Please enter the Return Vehicle Number.");
        return;
    }

    const returningArr = Array.from(returnSelectedBins).sort();
    const smallCount = returningArr.filter(id => id.includes('-S-')).length;
    const bigCount = returningArr.filter(id => id.includes('-B-')).length;

    // Populate Modal
    const previewArea = document.getElementById('returnPreviewContent');
    previewArea.innerHTML = `
        <div style="background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; color: #000;">
            <div style="display: grid; grid-template-columns: 1fr; gap: 12px; margin-bottom: 20px;">
                <div><span style="color: #666; font-size: 0.875rem;">Supplier:</span><br><strong style="color: #000; font-size: 1.1rem;">${currentReturnSupplier}</strong></div>
                <div><span style="color: #666; font-size: 0.875rem;">Return Vehicle:</span><br><strong style="color: #000;">${vehicle}</strong></div>
            </div>
            
            <div style="border-top: 1px solid #e2e8f0; padding-top: 16px;">
                <div style="display: flex; gap: 20px; margin-bottom: 12px;">
                    ${smallCount ? `<div><span style="color: #444; font-size: 0.75rem; font-weight: 600;">Small Bins:</span> <span style="font-weight: bold;">${smallCount}</span></div>` : ''}
                    ${bigCount ? `<div><span style="color: #444; font-size: 0.75rem; font-weight: 600;">Big Bins:</span> <span style="font-weight: bold;">${bigCount}</span></div>` : ''}
                </div>
                <div class="tags-container" style="max-height: 150px; overflow-y: auto; background: #fff; padding: 10px; border-radius: 8px; border: 1px solid #eee;">
                    ${returningArr.map(id => `<span class="tag" style="background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; font-size: 0.7rem;">${id.split('-').pop()}</span>`).join('')}
                </div>
            </div>
        </div>
    `;

    document.getElementById('returnPreviewModal').classList.remove('hidden');
    lucide.createIcons();
}

function handleReturnSubmit() {
    const returningArr = Array.from(returnSelectedBins);
    const vehicle = document.getElementById('returnVehicleNumber').value.trim();
    const supplierDispatches = state.dispatches.filter(d => d.supplier === currentReturnSupplier && d.status === 'ACTIVE');

    // Process each bin
    returningArr.forEach(binId => {
        const dispatch = supplierDispatches.find(d => d.bins.includes(binId) && !d.returnedBins.includes(binId));
        if (dispatch) {
            dispatch.returnedBins.push(binId);
            if (dispatch.returnedBins.length === dispatch.bins.length) {
                dispatch.status = 'COMPLETED';
            }
        }
    });

    // Update global bins state
    returningArr.forEach(binId => {
        const binType = binId.includes('-S-') ? 'small' : 'big';
        const bin = state.bins[binType].find(b => b.id === binId);
        if (bin) {
            bin.status = 'in_stock';
            bin.location = 'Synergy';
        }
    });

    const inwardReceiptData = {
        date: new Date().toISOString().split('T')[0],
        supplier: currentReturnSupplier,
        vehicle,
        bins: returningArr
    };

    // Add History Entry
    state.history.unshift({
        id: Date.now().toString() + '-H',
        type: 'RETURN',
        date: inwardReceiptData.date,
        dcNumber: 'Multiple',
        supplier: currentReturnSupplier,
        vehicle: vehicle,
        affectedBins: returningArr
    });

    saveState();
    
    alert(`Successfully processed inward of ${returningArr.length} bins!`);
    
    // Hide Modals / Reset
    document.getElementById('returnPreviewModal').classList.add('hidden');
    document.getElementById('returnVehicleNumber').value = '';
    
    currentReturnSupplier = null;
    returnSelectedBins.clear();
    document.getElementById('returnSupplierSelect').value = '';
    document.getElementById('returnDetailsArea').classList.add('hidden');
    
    populateReturnView();
    document.querySelector('.nav-btn[data-tab="dashboard"]').click();
    
    // Print Inward Receipt
    printInwardReceipt(inwardReceiptData);
}

function printInwardReceipt(data) {
    const printArea = document.getElementById('printArea');
    const small = data.bins.filter(id => id.includes('-S-'));
    const big = data.bins.filter(id => id.includes('-B-'));
    
    printArea.innerHTML = `
        <div class="print-header">
            <img src="logo.png" alt="Synergy Global Sourcing" style="height: 60px; object-fit: contain; margin-bottom: 15px;">
            <p>Krishna Group Compound Post. SIPCOT, Hosur – 635 126, Tamilnadu, India.</p>
            <p><strong>INWARD RECEIPT (BIN COLLECTION)</strong></p>
        </div>
        
        <div class="print-row">
            <div>
                <p><strong>Received From:</strong></p>
                <p>${data.supplier}</p>
            </div>
            <div style="text-align: right;">
                <p><strong>Receipt Date:</strong> ${data.date}</p>
                <p><strong>Vehicle Number:</strong> ${data.vehicle}</p>
            </div>
        </div>

        <table class="print-table">
            <thead>
                <tr>
                    <th>Asset Type</th>
                    <th>Qty Received</th>
                    <th>Asset Numbers Collected</th>
                </tr>
            </thead>
            <tbody>
                ${small.length ? `
                <tr>
                    <td>Small Bins (SGM-S)</td>
                    <td>${small.length} Nos</td>
                    <td><div class="bin-tags-container">${small.map(b => `<span class="bin-tag-print">${b}</span>`).join('')}</div></td>
                </tr>` : ''}
                ${big.length ? `
                <tr>
                    <td>Big Bins (SGM-B)</td>
                    <td>${big.length} Nos</td>
                    <td><div class="bin-tags-container">${big.map(b => `<span class="bin-tag-print">${b}</span>`).join('')}</div></td>
                </tr>` : ''}
            </tbody>
        </table>

        <div class="print-footer">
            <div class="signature-box">Receiver's Signature (Synergy)</div>
            <div class="signature-box">Driver's Signature</div>
        </div>
    `;
    
    window.print();
}

// --- HISTORY LOGIC --- //
function updateHistoryTable() {
    const tbody = document.querySelector('#historyTable tbody');
    tbody.innerHTML = '';
    
    if (state.history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted)">No transaction history</td></tr>';
        return;
    }

    state.history.forEach(h => {
        const tr = document.createElement('tr');
        const badgeClass = h.type === 'DISPATCH' ? 'primary' : 'success';
        
        // Actions available for this row
        let actionsHtml = `
            <div style="display: flex; gap: 8px;">
                <button class="btn btn-sm history-details-btn" data-dispatch-id="${h.dispatchId || ''}" data-dc="${h.dcNumber}" title="View Original Dispatch Details" style="padding: 4px 8px; font-size: 0.7rem; background: rgba(79, 70, 229, 0.1); color: #a5b4fc; border: 1px solid rgba(79, 70, 229, 0.2);">
                    <i data-lucide="eye" style="width: 12px; height: 12px;"></i>
                </button>
        `;
        
        if (h.type === 'DISPATCH') {
            actionsHtml += `
                <button class="btn btn-sm history-print-btn" data-type="DISPATCH" data-dc="${h.dcNumber}" title="Re-print Delivery Challan" style="padding: 4px 8px; font-size: 0.7rem; background: rgba(16, 185, 129, 0.1); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.2);">
                    <i data-lucide="printer" style="width: 12px; height: 12px;"></i>
                </button>
                <button class="btn btn-sm history-excel-btn" data-type="DISPATCH" data-dc="${h.dcNumber}" title="Export to Excel" style="padding: 4px 8px; font-size: 0.7rem; background: rgba(59, 130, 246, 0.1); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.2);">
                    <i data-lucide="file-spreadsheet" style="width: 12px; height: 12px;"></i>
                </button>
            `;
        } else if (h.type === 'RETURN') {
            actionsHtml += `
                <button class="btn btn-sm history-print-btn" data-type="RETURN" data-index="${index}" title="Re-print Inward Receipt" style="padding: 4px 8px; font-size: 0.7rem; background: rgba(16, 185, 129, 0.1); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.2);">
                    <i data-lucide="printer" style="width: 12px; height: 12px;"></i>
                </button>
            `;
        }
        
        actionsHtml += `</div>`;

        tr.innerHTML = `
            <td>${h.date}</td>
            <td><span class="badge ${badgeClass}">${h.type}</span></td>
            <td>${h.dcNumber}</td>
            <td>${h.supplier}</td>
            <td>${h.vehicle}</td>
            <td><div class="tags-container" style="max-height: 40px; overflow-y: auto;">
                ${h.affectedBins.map(id => `<span class="tag" style="background:transparent; font-size: 0.7rem; padding:1px 4px;">${id.split('-').pop()}</span>`).join('')}
            </div></td>
            <td>${actionsHtml}</td>
        `;
        tbody.appendChild(tr);
    });

    // Add Listeners
    document.querySelectorAll('.history-details-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const dcNumber = e.currentTarget.dataset.dc;
            const dispatchId = e.currentTarget.dataset.dispatchId;
            // Try to find by ID first, then fallback to DC number
            let dispatch = state.dispatches.find(d => d.id === dispatchId);
            if (!dispatch) {
                dispatch = state.dispatches.find(d => d.dcNumber === dcNumber);
            }
            
            if (dispatch) {
                showDispatchDetails(dispatch.id);
            } else {
                alert("Original dispatch record not found.");
            }
        });
    });

    document.querySelectorAll('.history-print-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const type = e.currentTarget.dataset.type;
            const dc = e.currentTarget.dataset.dc;
            const idx = e.currentTarget.dataset.index;

            if (type === 'DISPATCH') {
                const dispatch = state.dispatches.find(d => d.dcNumber === dc);
                if (dispatch) printDC(dispatch);
            } else if (type === 'RETURN') {
                const historyItem = state.history[idx];
                if (historyItem) {
                    printInwardReceipt({
                        date: historyItem.date,
                        supplier: historyItem.supplier,
                        vehicle: historyItem.vehicle,
                        bins: historyItem.affectedBins
                    });
                }
            }
        });
    });

    document.querySelectorAll('.history-excel-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const dcNumber = e.currentTarget.dataset.dc;
            const dispatchId = e.currentTarget.dataset.dispatchId;
            let dispatch = state.dispatches.find(d => d.id === dispatchId);
            if (!dispatch) {
                dispatch = state.dispatches.find(d => d.dcNumber === dcNumber);
            }
            
            if (dispatch) {
                exportToExcelSingle(dispatch);
            } else {
                alert("Original dispatch record not found for excel export.");
            }
        });
    });

    lucide.createIcons();
}

// --- SUPPLIER LEDGER LOGIC --- //
function initSupplierLogic() {
    document.getElementById('ledgerCollectBtn').addEventListener('click', () => {
        const supplierName = document.getElementById('ledgerSupplierName').textContent;
        document.getElementById('ledgerModal').classList.add('hidden');
        
        // Navigate to Return Bins
        const returnTab = document.querySelector('.nav-btn[data-tab="return"]');
        returnTab.click();
        
        // Select the supplier
        setTimeout(() => {
            const select = document.getElementById('returnSupplierSelect');
            select.value = supplierName;
            select.dispatchEvent(new Event('change'));
        }, 100);
    });
}

function populateSuppliersView() {
    const tbody = document.querySelector('#suppliersTable tbody');
    tbody.innerHTML = '';

    // We can get all suppliers from the SUPPIERS_LIST or just the ones who have history
    const allSuppliers = typeof SUPPIERS_LIST !== 'undefined' ? SUPPIERS_LIST : [];
    
    // Supplement with any custom suppliers from history
    const historySuppliers = state.history.map(h => h.supplier);
    const uniqueSuppliers = [...new Set([...allSuppliers, ...historySuppliers])].sort();

    uniqueSuppliers.forEach(supplier => {
        const stats = calculateSupplierStats(supplier);
        
        // Only show suppliers who have at least 1 txn or are in the master list
        if (stats.sent === 0 && stats.returned === 0) return;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 500;">${supplier}</td>
            <td>${stats.sent}</td>
            <td>${stats.returned}</td>
            <td><span class="badge ${stats.balance > 0 ? 'warning' : 'success'}">${stats.balance}</span></td>
            <td>
                <button class="btn btn-sm view-ledger-btn" data-supplier="${supplier}" style="background: rgba(79, 70, 229, 0.1); color: #a5b4fc; border: 1px solid rgba(79, 70, 229, 0.2);">
                    <i data-lucide="book-open" style="width: 14px; height: 14px; margin-right: 4px;"></i> Ledger
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.querySelectorAll('.view-ledger-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            showSupplierLedger(e.currentTarget.dataset.supplier);
        });
    });

    lucide.createIcons();
}

function calculateSupplierStats(supplier) {
    let sent = 0;
    let returned = 0;

    state.history.forEach(h => {
        if (h.supplier === supplier) {
            if (h.type === 'DISPATCH') sent += h.affectedBins.length;
            if (h.type === 'RETURN') returned += h.affectedBins.length;
        }
    });

    return { sent, returned, balance: sent - returned };
}

function showSupplierLedger(supplier) {
    document.getElementById('ledgerSupplierName').textContent = supplier;
    
    // Populate History Table in Ledger
    const historyContainer = document.getElementById('ledgerHistoryContent');
    const supplierHistory = state.history.filter(h => h.supplier === supplier);
    
    if (supplierHistory.length === 0) {
        historyContainer.innerHTML = '<p style="color: #666; font-size: 0.8rem; padding: 20px; text-align: center;">No transaction history found.</p>';
    } else {
        let tableHtml = `
            <table class="modern-table" style="font-size: 0.8rem;">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>DC/Ref</th>
                        <th>Qty</th>
                    </tr>
                </thead>
                <tbody>
                    ${supplierHistory.map(h => `
                        <tr>
                            <td>${h.date}</td>
                            <td><span class="badge ${h.type === 'DISPATCH' ? 'primary' : 'success'}">${h.type}</span></td>
                            <td>${h.dcNumber}</td>
                            <td>${h.affectedBins.length}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        historyContainer.innerHTML = tableHtml;
    }

    // Populate Current Assets
    const assetsContainer = document.getElementById('ledgerAssetsContent');
    const heldBins = [];
    state.dispatches
        .filter(d => d.supplier === supplier && d.status === 'ACTIVE')
        .forEach(d => {
            const pending = d.bins.filter(b => !d.returnedBins.includes(b));
            heldBins.push(...pending);
        });

    if (heldBins.length === 0) {
        assetsContainer.innerHTML = '<p style="color: #94a3b8; font-size: 0.8rem; text-align: center;">No bins currently held.</p>';
        document.getElementById('ledgerCollectBtn').style.display = 'none';
    } else {
        assetsContainer.innerHTML = heldBins.sort().map(id => `
            <span class="tag" style="background: white; color: #334155; border: 1px solid #e2e8f0; font-size: 0.7rem; padding: 2px 6px;">${id}</span>
        `).join('');
        document.getElementById('ledgerCollectBtn').style.display = 'block';
    }

    document.getElementById('ledgerModal').classList.remove('hidden');
    lucide.createIcons();
}

function exportToExcelSingle(d) {
    if (typeof XLSX === 'undefined') {
        alert("Excel export library not loaded.");
        return;
    }

    const small = d.bins.filter(id => id.includes('-S-'));
    const big = d.bins.filter(id => id.includes('-B-'));
    
    const data = [
        ["Synergy Global Sourcing - Delivery Challan"],
        [""],
        ["DC Number:", d.dcNumber, "Date:", d.date],
        ["Supplier:", d.supplier],
        ["Vehicle:", d.vehicle],
        [""],
        ["Asset Type", "Quantity", "Asset IDs"]
    ];

    if (small.length) data.push(["Small Bins", small.length, small.join(", ")]);
    if (big.length) data.push(["Big Bins", big.length, big.join(", ")]);

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DC Details");
    XLSX.writeFile(wb, `Delivery_Challan_${d.dcNumber}.xlsx`);
}

// --- PRINT & EXPORT --- //
function printDC(dispatchData) {
    const printArea = document.getElementById('printArea');
    
    const binsListHTML = dispatchData.bins.map(b => `<span class="bin-tag-print">${b}</span>`).join('');
    
    printArea.innerHTML = `
        <div class="print-header">
            <img src="logo.png" alt="Synergy Global Sourcing" style="height: 60px; object-fit: contain; margin-bottom: 15px;">
            <p>Krishna Group Compound Post. SIPCOT, Hosur – 635 126, Tamilnadu, India.</p>
            <p><strong>DELIVERY CHALLAN - ASSET TRACKING</strong></p>
        </div>
        
        <div class="print-row">
            <div>
                <p><strong>To:</strong></p>
                <p>${dispatchData.supplier}</p>
            </div>
            <div style="text-align: right;">
                <p><strong>DC Number:</strong> ${dispatchData.dcNumber}</p>
                <p><strong>Date:</strong> ${dispatchData.date}</p>
                <p><strong>Vehicle Number:</strong> ${dispatchData.vehicle}</p>
            </div>
        </div>

        <table class="print-table">
            <thead>
                <tr>
                    <th>Asset Type</th>
                    <th>Total Qty</th>
                    <th>Asset Numbers Dispatched</th>
                </tr>
            </thead>
            <tbody>
                ${dispatchData.bins.filter(id => id.includes('-S-')).length ? `
                <tr>
                    <td>Small Bins (SGM-S)</td>
                    <td>${dispatchData.bins.filter(id => id.includes('-S-')).length} Nos</td>
                    <td>
                        <div class="bin-tags-container">
                            ${dispatchData.bins.filter(id => id.includes('-S-')).map(b => `<span class="bin-tag-print">${b}</span>`).join('')}
                        </div>
                    </td>
                </tr>` : ''}
                ${dispatchData.bins.filter(id => id.includes('-B-')).length ? `
                <tr>
                    <td>Big Bins (SGM-B)</td>
                    <td>${dispatchData.bins.filter(id => id.includes('-B-')).length} Nos</td>
                    <td>
                        <div class="bin-tags-container">
                            ${dispatchData.bins.filter(id => id.includes('-B-')).map(b => `<span class="bin-tag-print">${b}</span>`).join('')}
                        </div>
                    </td>
                </tr>` : ''}
            </tbody>
        </table>

        <div class="print-footer">
            <div class="signature-box">Authorized Signature</div>
            <div class="signature-box">Receiver's Signature / Seal</div>
        </div>
    `;
    
    window.print();
}

function exportToExcel() {
    if(!window.XLSX) {
        alert("Excel export library not loaded properly.");
        return;
    }

    // Prepare data
    const exportData = state.history.map(h => ({
        'Date': h.date,
        'Type': h.type,
        'DC Number': h.dcNumber,
        'Supplier': h.supplier,
        'Vehicle Number': h.vehicle,
        'Asset IDs': h.affectedBins.join(', '),
        'Total Bins Count': h.affectedBins.length
    }));

    if(exportData.length === 0) {
        alert("No history to export.");
        return;
    }

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Asset History");
    
    XLSX.writeFile(wb, `Synergy_Asset_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// --- AUTH LOGIC --- //
function initAuthLogic() {
    const authOverlay = document.getElementById('auth-overlay');
    const appContainer = document.getElementById('app');
    
    const loginCard = document.getElementById('loginCard');
    const resetCard = document.getElementById('resetCard');
    
    const loginForm = document.getElementById('loginForm');
    const resetForm = document.getElementById('resetForm');
    const logoutBtn = document.getElementById('logoutBtn');
    const forgotBtn = document.getElementById('forgotBtn');
    const cancelResetBtn = document.getElementById('cancelResetBtn');

    // Check if logged in
    if (sessionStorage.getItem('auth_token') === 'true') {
        authOverlay.classList.add('hidden');
        appContainer.classList.remove('hidden');
    }

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = document.getElementById('usernameInput').value.trim();
        const pass = document.getElementById('passwordInput').value;
        const errorEl = document.getElementById('loginError');
        
        // Retrieve custom password or use default
        const storedPassword = localStorage.getItem('sgs_admin_pwd') || 'sgs@123';
        
        if (user === 'stores' && pass === storedPassword) {
            sessionStorage.setItem('auth_token', 'true');
            errorEl.classList.add('hidden');
            authOverlay.classList.add('hidden');
            appContainer.classList.remove('hidden');
            document.getElementById('passwordInput').value = '';
        } else {
            errorEl.classList.remove('hidden');
            errorEl.textContent = 'Invalid username or password';
        }
    });

    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('auth_token');
        window.location.reload();
    });

    forgotBtn.addEventListener('click', () => {
        loginCard.classList.add('hidden');
        resetCard.classList.remove('hidden');
        alert("A password reset link has been simulated for sent to stores@synergyglobal.in.");
    });

    cancelResetBtn.addEventListener('click', () => {
        resetCard.classList.add('hidden');
        loginCard.classList.remove('hidden');
        resetForm.reset();
        document.getElementById('resetError').classList.add('hidden');
    });

    resetForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const newPass = document.getElementById('newPasswordInput').value;
        const confirmPass = document.getElementById('confirmPasswordInput').value;
        const errorEl = document.getElementById('resetError');
        
        if (newPass !== confirmPass) {
            errorEl.classList.remove('hidden');
            errorEl.textContent = 'Passwords do not match';
            return;
        }
        
        if (newPass.length < 5) {
            errorEl.classList.remove('hidden');
            errorEl.textContent = 'Password must be at least 5 characters long';
            return;
        }

        // Save new password locally
        localStorage.setItem('sgs_admin_pwd', newPass);
        
        alert("Password reset successfully! You can now log in.");
        resetForm.reset();
        errorEl.classList.add('hidden');
        resetCard.classList.add('hidden');
        loginCard.classList.remove('hidden');
    });
}

// --- VEHICLE LOGIC --- //
const DEFAULT_VEHICLES = ['KA51AK6730', 'KA51D9173', 'KA514937', 'TN70AQ8526', 'TN70M3426'];

function initVehicles() {
    const select = document.getElementById('vehicleSelect');
    const customInput = document.getElementById('vehicleNumberCustom');
    
    // Clear existing (except ADD_NEW)
    Array.from(select.options).forEach(opt => {
        if (opt.value !== '' && opt.value !== 'ADD_NEW') {
            opt.remove();
        }
    });

    // Load from local storage or defaults
    let savedVehicles = JSON.parse(localStorage.getItem('sgs_saved_vehicles'));
    if (!savedVehicles || savedVehicles.length === 0) {
        savedVehicles = [...DEFAULT_VEHICLES];
        localStorage.setItem('sgs_saved_vehicles', JSON.stringify(savedVehicles));
    }

    // Populate
    const addNewOption = select.querySelector('option[value="ADD_NEW"]');
    savedVehicles.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        select.insertBefore(opt, addNewOption);
    });

    // Manage Add New visibility
    select.addEventListener('change', (e) => {
        if (e.target.value === 'ADD_NEW') {
            customInput.classList.remove('hidden');
            customInput.required = true;
            customInput.focus();
        } else {
            customInput.classList.add('hidden');
            customInput.required = false;
        }
    });
}

function saveNewVehicle(vehicleNumber) {
    if (!vehicleNumber) return;
    
    let savedVehicles = JSON.parse(localStorage.getItem('sgs_saved_vehicles')) || [];
    if (!savedVehicles.includes(vehicleNumber)) {
        savedVehicles.push(vehicleNumber);
        localStorage.setItem('sgs_saved_vehicles', JSON.stringify(savedVehicles));
        
        // Re-init to update dropdown
        initVehicles();
        
        // Select the newly added one
        document.getElementById('vehicleSelect').value = vehicleNumber;
        document.getElementById('vehicleNumberCustom').classList.add('hidden');
        document.getElementById('vehicleNumberCustom').value = '';
    }
}
