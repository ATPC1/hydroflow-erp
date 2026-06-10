// HydroFlow ERP - Core Javascript Logic
// Powered by Dexie.js (IndexedDB) and jsPDF

// Global State
let db;
let currentCart = [];
let currentSection = 'pos-section';
let pinAttempt = '';
let activeProductSuggestions = [];

// Default Business Profile Configuration
const DEFAULT_SUPPLIER = {
  name: "A-One Waterart's",
  gstin: "27CCCPS2981N2ZV",
  stateCode: "27",
  stateName: "Maharashtra",
  address: "C-11 kashmiri apt navghar road Vasai East 401208.",
  tagline: "Fountain, Swimming pool, Waterscapes, Irrigation system, Effect Under water Lighting, & Landscape Works.",
  email: "upendras509@gmail.com",
  instagram: "http://www.instagram.com/aonewaterarts",
  bankName: "BASSEIN CATHOLIC CO-OPERATIVE BANK LTD",
  bankAcc: "037110100000304",
  bankIfsc: "BACB0000037",
  bankBranch: "Navghar Vasai East"
};

// State mapping for GSTIN Parsing
const GST_STATE_MAP = {
  "27": "Maharashtra (27) - Local",
  "24": "Gujarat (24)",
  "09": "Uttar Pradesh (09)",
  "07": "Delhi (07)",
  "19": "West Bengal (19)",
  "29": "Karnataka (29)",
  "33": "Tamil Nadu (33)",
  "36": "Telangana (36)",
  "03": "Punjab (03)",
  "08": "Rajasthan (08)",
  "10": "Bihar (10)",
  "23": "Madhya Pradesh (23)"
};

// Seed Data for initial load
const SEED_PRODUCTS = [
  { name: "Submersible Pump 1.5HP", category: "Pump", hsn: "8413", basePrice: 12500, gstRate: 18, stock: 15 },
  { name: "Monoblock Pump 1HP", category: "Pump", hsn: "8413", basePrice: 8400, gstRate: 18, stock: 8 },
  { name: "Brass Gate Valve 2 inch", category: "Valves", hsn: "8481", basePrice: 1200, gstRate: 18, stock: 4 },
  { name: "PVC Pipe Schedule 40 (4 inch)", category: "Pipes", hsn: "3917", basePrice: 450, gstRate: 18, stock: 45 },
  { name: "Stainless Steel Coupling 2 inch", category: "Fittings", hsn: "7307", basePrice: 280, gstRate: 18, stock: 3 },
  { name: "Pressure Gauge 0-10 Bar", category: "Accessories", hsn: "9026", basePrice: 950, gstRate: 12, stock: 12 },
  { name: "Control Panel Single Phase", category: "Accessories", hsn: "8537", basePrice: 3200, gstRate: 18, stock: 6 },
  { name: "Ball Valve PVC 1 inch", category: "Valves", hsn: "8481", basePrice: 180, gstRate: 18, stock: 25 }
];

// Initialize application on load
window.addEventListener('DOMContentLoaded', async () => {
  initDatabase();
  initRouting();
  initPinVerification();
  initScannerHook();
  initGstSelector();
  initAutocomplete();
});

// Initialize Dexie Database
async function initDatabase() {
  db = new Dexie('HydroFlowDB');
  db.version(1).stores({
    products: '++id, name, category, hsn, basePrice, gstRate, stock',
    invoices: '++id, invoiceNumber, customerName, customerEmail, customerGSTIN, customerState, total, createdAt',
    settings: 'key, value'
  });

  // Verify and seed products
  const productCount = await db.products.count();
  if (productCount === 0) {
    await db.products.bulkAdd(SEED_PRODUCTS);
  }

  // Seed default settings
  const pinSetting = await db.settings.get('owner_pin');
  if (!pinSetting) {
    await db.settings.put({ key: 'owner_pin', value: '1234' });
  }

  const supplierSetting = await db.settings.get('supplier_profile');
  if (!supplierSetting) {
    await db.settings.put({ key: 'supplier_profile', value: DEFAULT_SUPPLIER });
  }

  const emailSetting = await db.settings.get('email_relay');
  if (!emailSetting) {
    await db.settings.put({ key: 'email_relay', value: { key: '', sender: 'billing@aonewaterarts.com', autoEmail: false } });
  }

  // Load profile configs into settings inputs
  loadSettingsForm();

  // Load components
  refreshInventoryTable();
  refreshDashboard();
}

// -----------------------------------------
// Lock Screen & Pin Overlay Logic
// -----------------------------------------
function initPinVerification() {
  const isUnlocked = sessionStorage.getItem('hydroflow_unlocked');
  const lockScreen = document.getElementById('lock-screen');
  
  if (isUnlocked === 'true') {
    lockScreen.style.display = 'none';
  } else {
    lockScreen.style.display = 'flex';
  }

  // Physical keyboard support for lock screen
  window.addEventListener('keydown', (e) => {
    if (lockScreen.style.display !== 'none') {
      if (e.key >= '0' && e.key <= '9') {
        pressKey(e.key);
      } else if (e.key === 'Backspace') {
        pressAction('back');
      } else if (e.key === 'Escape') {
        pressAction('clear');
      }
    }
  });
}

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById(`dot-${i}`);
    if (i < pinAttempt.length) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  }
}

async function pressKey(num) {
  if (pinAttempt.length < 4) {
    pinAttempt += num;
    updatePinDots();
    
    // Auto-submit once 4 digits are completed
    if (pinAttempt.length === 4) {
      setTimeout(verifyPin, 150);
    }
  }
}

function pressAction(action) {
  if (action === 'clear') {
    pinAttempt = '';
  } else if (action === 'back' && pinAttempt.length > 0) {
    pinAttempt = pinAttempt.slice(0, -1);
  }
  updatePinDots();
}

async function verifyPin() {
  const pinSetting = await db.settings.get('owner_pin');
  const correctPin = pinSetting ? pinSetting.value : '1234';

  if (pinAttempt === correctPin) {
    sessionStorage.setItem('hydroflow_unlocked', 'true');
    const lockScreen = document.getElementById('lock-screen');
    lockScreen.style.display = 'none';
    pinAttempt = '';
    updatePinDots();
    
    // Initialize icons
    lucide.createIcons();
  } else {
    // Play error vibration & shake effect
    const container = document.querySelector('.lock-container');
    container.classList.add('shake');
    
    // Hardware vibration if supported
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }
    
    pinAttempt = '';
    updatePinDots();
    
    setTimeout(() => {
      container.classList.remove('shake');
    }, 400);
  }
}

function lockConsole() {
  sessionStorage.removeItem('hydroflow_unlocked');
  pinAttempt = '';
  updatePinDots();
  document.getElementById('lock-screen').style.display = 'flex';
}

// -----------------------------------------
// Navigation & Router
// -----------------------------------------
function initRouting() {
  const navLinks = document.querySelectorAll('.nav-link-custom');
  const sections = document.querySelectorAll('.spa-section');

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Update active nav state
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      // Swap displayed section
      const targetId = link.getAttribute('data-target');
      currentSection = targetId;
      
      sections.forEach(sec => {
        if (sec.id === targetId) {
          sec.style.display = 'block';
        } else {
          sec.style.display = 'none';
        }
      });

      // Specific section loads
      if (targetId === 'inventory-section') {
        refreshInventoryTable();
      } else if (targetId === 'dashboard-section') {
        refreshDashboard();
      } else if (targetId === 'settings-section') {
        loadSettingsForm();
      }

      // Re-trigger icon replacements
      lucide.createIcons();
    });
  });
  
  lucide.createIcons();
}

// -----------------------------------------
// POS Terminal - Cart & Scanner Hook
// -----------------------------------------
function initScannerHook() {
  let barcodeBuffer = '';
  let lastKeyTime = Date.now();

  // USB Barcode Scanner Hook
  window.addEventListener('keypress', async (e) => {
    // Ignore key accumulation if typing in typical customer/settings inputs
    const activeEl = document.activeElement;
    const isExcludedInput = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA';
    const isSearchInput = activeEl.id === 'product-search-input' || activeEl.id === 'manual-scanner-input';
    
    if (isExcludedInput && !isSearchInput) {
      return; 
    }

    const currentTime = Date.now();
    
    // Barcode scanners print characters extremely fast (<30ms per character)
    if (currentTime - lastKeyTime > 50) {
      barcodeBuffer = '';
    }
    lastKeyTime = currentTime;

    if (e.key === 'Enter') {
      if (barcodeBuffer.length > 2) {
        e.preventDefault();
        await handleBarcodeScan(barcodeBuffer);
        barcodeBuffer = '';
      }
    } else {
      barcodeBuffer += e.key;
    }
  });

  // Manual fallback input hook
  const manualInput = document.getElementById('manual-scanner-input');
  manualInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = manualInput.value.trim();
      if (code) {
        await handleBarcodeScan(code);
        manualInput.value = '';
      }
    }
  });
}

// Trigger actions on barcode scan match
async function handleBarcodeScan(code) {
  // Try matching HSN code or Name exactly
  let product = await db.products.where('hsn').equals(code).first();
  if (!product) {
    // Case-insensitive search by name
    product = await db.products.filter(p => p.name.toLowerCase() === code.toLowerCase()).first();
  }

  if (product) {
    addToCart(product);
    showToast(`Added ${product.name} to Cart`, 'success');
  } else {
    showToast(`No product matched scanner input: "${code}"`, 'danger');
  }
}

// Add Item to Cart Array
function addToCart(product) {
  const existing = currentCart.find(item => item.product.id === product.id);
  
  if (existing) {
    existing.qty += 1;
  } else {
    currentCart.push({
      product: product,
      qty: 1,
      gstOverride: product.gstRate // starts with default GST rate
    });
  }

  updateCartUI();
}

function updateCartQty(index, newQty) {
  if (newQty <= 0) {
    currentCart.splice(index, 1);
  } else {
    currentCart[index].qty = parseInt(newQty);
  }
  updateCartUI();
}

function updateCartGst(index, gstRate) {
  currentCart[index].gstOverride = parseInt(gstRate);
  updateCartUI();
}

function removeFromCart(index) {
  currentCart.splice(index, 1);
  updateCartUI();
}

function clearCart() {
  currentCart = [];
  document.getElementById('cust-name').value = '';
  document.getElementById('cust-address').value = '';
  document.getElementById('cust-gstin').value = '';
  document.getElementById('cust-state').value = '27';
  document.getElementById('cust-mobile').value = '';
  document.getElementById('cust-email').value = '';
  document.getElementById('transport-cost').value = '0';
  updateCartUI();
}

// -----------------------------------------
// Tax Engine Calculations (Intra-state/Inter-state & Transportation Proportional Split)
// -----------------------------------------
function updateCartUI() {
  const cartBody = document.getElementById('cart-items-body');
  cartBody.innerHTML = '';

  if (currentCart.length === 0) {
    cartBody.innerHTML = `
      <tr id="empty-cart-row">
        <td colspan="6" class="text-center text-muted py-5">
          <i data-lucide="shopping-bag" style="width: 48px; height: 48px;" class="mb-3 d-block mx-auto opacity-50"></i>
          Cart is empty. Search products above or scan item barcode to start billing.
        </td>
      </tr>`;
    lucide.createIcons();
    calculateTotals();
    return;
  }

  currentCart.forEach((item, index) => {
    const itemTotal = item.product.basePrice * item.qty;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <div class="fw-bold text-white">${item.product.name}</div>
        <small class="text-muted">HSN: ${item.product.hsn}</small>
      </td>
      <td>
        <input type="number" class="form-control form-glass-input py-1 px-2" value="${item.product.basePrice}" onchange="updateCartPrice(${index}, this.value)" style="width: 100px;">
      </td>
      <td>
        <input type="number" class="form-control form-glass-input py-1 px-2" min="1" value="${item.qty}" onchange="updateCartQty(${index}, this.value)" style="width: 70px;">
      </td>
      <td>
        <select class="form-select form-glass-input py-1 px-2" onchange="updateCartGst(${index}, this.value)" style="width: 85px;">
          <option value="18" ${item.gstOverride === 18 ? 'selected' : ''}>18%</option>
          <option value="12" ${item.gstOverride === 12 ? 'selected' : ''}>12%</option>
          <option value="5" ${item.gstOverride === 5 ? 'selected' : ''}>5%</option>
          <option value="28" ${item.gstOverride === 28 ? 'selected' : ''}>28%</option>
          <option value="0" ${item.gstOverride === 0 ? 'selected' : ''}>0%</option>
        </select>
      </td>
      <td class="align-middle text-white fw-bold">₹${itemTotal.toFixed(2)}</td>
      <td class="text-end align-middle">
        <button class="btn btn-sm btn-outline-danger border-0 p-1" onclick="removeFromCart(${index})">
          <i data-lucide="trash-2" style="width: 18px;"></i>
        </button>
      </td>
    `;
    cartBody.appendChild(row);
  });

  lucide.createIcons();
  calculateTotals();
}

function updateCartPrice(index, price) {
  const val = parseFloat(price);
  if (!isNaN(val) && val >= 0) {
    currentCart[index].product.basePrice = val;
  }
  updateCartUI();
}

// Master Tax Calculations & Distribution
function calculateTotals() {
  const transportCostInput = document.getElementById('transport-cost');
  const transportCost = parseFloat(transportCostInput.value) || 0;
  
  // Calculate Subtotal (sum of base price * qty)
  let itemsSubtotal = 0;
  currentCart.forEach(item => {
    itemsSubtotal += item.product.basePrice * item.qty;
  });

  // Split Transport Cost Proportional to Item Value
  // Allocated Transport = Total Transport * (Item Taxable Value / Total Items Taxable Value)
  let totalTaxAmt = 0;
  let totalCGST = 0;
  let totalSGST = 0;
  let totalIGST = 0;

  const customerState = document.getElementById('cust-state').value;
  const isIntraState = (customerState === "27"); // Maharashtra is 27 (Local supply)

  currentCart.forEach(item => {
    const itemSubtotal = item.product.basePrice * item.qty;
    
    // Proportional transport allocation
    let allocatedTransport = 0;
    if (itemsSubtotal > 0) {
      allocatedTransport = transportCost * (itemSubtotal / itemsSubtotal);
    }

    // Composite taxable value
    const compositeTaxable = itemSubtotal + allocatedTransport;
    const taxRate = item.gstOverride;
    
    const taxAmount = compositeTaxable * (taxRate / 100);
    totalTaxAmt += taxAmount;

    if (isIntraState) {
      totalCGST += taxAmount / 2;
      totalSGST += taxAmount / 2;
    } else {
      totalIGST += taxAmount;
    }
  });

  const grandTotal = itemsSubtotal + transportCost + totalTaxAmt;

  // Render values
  document.getElementById('calc-subtotal').innerText = `₹${itemsSubtotal.toFixed(2)}`;
  document.getElementById('calc-transport').innerText = `₹${transportCost.toFixed(2)}`;

  const taxRows = document.getElementById('tax-breakdown-rows');
  taxRows.innerHTML = '';

  if (isIntraState) {
    taxRows.innerHTML = `
      <div class="d-flex justify-content-between mb-2 small text-secondary">
        <span>CGST (Central Tax):</span>
        <span class="text-white">₹${totalCGST.toFixed(2)}</span>
      </div>
      <div class="d-flex justify-content-between mb-2 small text-secondary">
        <span>SGST (State Tax):</span>
        <span class="text-white">₹${totalSGST.toFixed(2)}</span>
      </div>
    `;
  } else {
    taxRows.innerHTML = `
      <div class="d-flex justify-content-between mb-2 small text-secondary">
        <span>IGST (Integrated Tax):</span>
        <span class="text-white">₹${totalIGST.toFixed(2)}</span>
      </div>
    `;
  }

  document.getElementById('calc-total').innerText = `₹${grandTotal.toFixed(2)}`;
}

// Smart GSTIN Parsing
function initGstSelector() {
  const gstinInput = document.getElementById('cust-gstin');
  const stateSelect = document.getElementById('cust-state');

  gstinInput.addEventListener('input', () => {
    const gstin = gstinInput.value.trim().toUpperCase();
    gstinInput.value = gstin;

    if (gstin.length >= 2) {
      const stateCode = gstin.substring(0, 2);
      if (GST_STATE_MAP[stateCode]) {
        stateSelect.value = stateCode;
        calculateTotals();
        showToast(`Auto-selected state: ${GST_STATE_MAP[stateCode].split(" - ")[0]}`, 'info');
      }
    }
  });

  stateSelect.addEventListener('change', () => {
    calculateTotals();
  });

  document.getElementById('transport-cost').addEventListener('input', () => {
    calculateTotals();
  });
}

// Autocomplete product input
function initAutocomplete() {
  const searchInput = document.getElementById('product-search-input');
  const suggestionsBox = document.getElementById('product-suggestions');

  searchInput.addEventListener('input', async () => {
    const query = searchInput.value.trim().toLowerCase();
    
    if (query.length === 0) {
      suggestionsBox.style.display = 'none';
      return;
    }

    // Filter products locally from IndexedDB
    const matched = await db.products.filter(p => {
      return p.name.toLowerCase().includes(query) || 
             p.hsn.includes(query) || 
             p.category.toLowerCase().includes(query);
    }).toArray();

    suggestionsBox.innerHTML = '';
    
    if (matched.length > 0) {
      suggestionsBox.style.display = 'block';
      matched.slice(0, 5).forEach(product => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.innerHTML = `
          <div class="fw-bold">${product.name}</div>
          <div class="small text-muted d-flex justify-content-between">
            <span>HSN: ${product.hsn} | Cat: ${product.category}</span>
            <span class="text-cyan">₹${product.basePrice} (GST ${product.gstRate}%)</span>
          </div>
        `;
        item.addEventListener('click', () => {
          addToCart(product);
          searchInput.value = '';
          suggestionsBox.style.display = 'none';
        });
        suggestionsBox.appendChild(item);
      });
    } else {
      suggestionsBox.style.display = 'block';
      suggestionsBox.innerHTML = '<div class="p-3 text-muted text-center small">No matches found. Try inventory tab.</div>';
    }
  });

  // Close suggestion list on click outside
  document.addEventListener('click', (e) => {
    if (e.target !== searchInput) {
      suggestionsBox.style.display = 'none';
    }
  });
}

// -----------------------------------------
// Inventory Control CRUD Operations
// -----------------------------------------
async function refreshInventoryTable() {
  const tableBody = document.getElementById('inventory-table-body');
  const searchVal = document.getElementById('inventory-search').value.toLowerCase().trim();
  const filterVal = document.getElementById('inventory-filter').value;
  
  let query = db.products;
  
  if (filterVal) {
    query = query.where('category').equals(filterVal);
  }

  let products = await query.toArray();

  if (searchVal) {
    products = products.filter(p => 
      p.name.toLowerCase().includes(searchVal) ||
      p.hsn.includes(searchVal)
    );
  }

  tableBody.innerHTML = '';
  let lowStockCount = 0;

  if (products.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">No products in inventory registry.</td></tr>`;
  } else {
    products.forEach(p => {
      const isLowStock = p.stock < 5;
      if (isLowStock) lowStockCount++;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="text-white fw-bold">
          ${p.name}
          ${isLowStock ? '<span class="badge bg-danger ms-2 small">Low Stock</span>' : ''}
        </td>
        <td>${p.category}</td>
        <td><code>${p.hsn}</code></td>
        <td>₹${p.basePrice.toFixed(2)}</td>
        <td>${p.gstRate}%</td>
        <td>
          <span class="fw-bold ${isLowStock ? 'text-danger' : 'text-success'}">${p.stock} units</span>
        </td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-info border-0 me-2" onclick="editProduct(${p.id})">
            <i data-lucide="edit" style="width:16px;"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger border-0" onclick="deleteProduct(${p.id})">
            <i data-lucide="trash-2" style="width:16px;"></i>
          </button>
        </td>
      `;
      tableBody.appendChild(tr);
    });
  }

  // Handle Low Stock Badges
  const badgeContainer = document.getElementById('low-stock-badge-container');
  const alertBox = document.getElementById('low-stock-alert-box');
  
  if (lowStockCount > 0) {
    badgeContainer.innerHTML = `<span class="pulse-badge"></span>`;
    if (alertBox) alertBox.style.display = 'block';
  } else {
    badgeContainer.innerHTML = '';
    if (alertBox) alertBox.style.display = 'none';
  }

  lucide.createIcons();
}

// Inventory search listeners
document.getElementById('inventory-search').addEventListener('input', refreshInventoryTable);
document.getElementById('inventory-filter').addEventListener('change', refreshInventoryTable);

function resetProductForm() {
  document.getElementById('product-modal-title').innerText = "Add New Inventory Item";
  document.getElementById('edit-prod-id').value = '';
  document.getElementById('prod-name').value = '';
  document.getElementById('prod-category').value = 'Pump';
  document.getElementById('prod-hsn').value = '';
  document.getElementById('prod-price').value = '';
  document.getElementById('prod-gst').value = '18';
  document.getElementById('prod-stock').value = '';
}

async function editProduct(id) {
  const product = await db.products.get(id);
  if (product) {
    document.getElementById('product-modal-title').innerText = "Edit Inventory Item";
    document.getElementById('edit-prod-id').value = product.id;
    document.getElementById('prod-name').value = product.name;
    document.getElementById('prod-category').value = product.category;
    document.getElementById('prod-hsn').value = product.hsn;
    document.getElementById('prod-price').value = product.basePrice;
    document.getElementById('prod-gst').value = product.gstRate;
    document.getElementById('prod-stock').value = product.stock;
    
    // Open bootstrap modal programmatically
    const modal = new bootstrap.Modal(document.getElementById('product-modal'));
    modal.show();
  }
}

async function saveProduct() {
  const id = document.getElementById('edit-prod-id').value;
  const name = document.getElementById('prod-name').value.trim();
  const category = document.getElementById('prod-category').value;
  const hsn = document.getElementById('prod-hsn').value.trim();
  const price = parseFloat(document.getElementById('prod-price').value);
  const gst = parseInt(document.getElementById('prod-gst').value);
  const stock = parseInt(document.getElementById('prod-stock').value);

  if (!name || !hsn || isNaN(price) || isNaN(stock)) {
    showToast("Please fill all product fields correctly", "danger");
    return;
  }

  const payload = { name, category, hsn, basePrice: price, gstRate: gst, stock };

  try {
    if (id) {
      await db.products.update(parseInt(id), payload);
      showToast("Product updated successfully", "success");
    } else {
      await db.products.add(payload);
      showToast("Product added successfully", "success");
    }

    // Hide Modal
    const modalEl = document.getElementById('product-modal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    refreshInventoryTable();
  } catch (err) {
    showToast("Error saving product: " + err.message, "danger");
  }
}

async function deleteProduct(id) {
  if (confirm("Are you sure you want to delete this inventory item?")) {
    await db.products.delete(id);
    showToast("Product deleted from registry", "info");
    refreshInventoryTable();
  }
}

// -----------------------------------------
// Owner's Analytics Dashboard Calculations
// -----------------------------------------
async function refreshDashboard() {
  const invoices = await db.invoices.toArray();
  const products = await db.products.toArray();
  
  // Total Revenue
  const totalRevenue = invoices.reduce((sum, inv) => sum + inv.total, 0);
  document.getElementById('kpi-total-revenue').innerText = `₹${totalRevenue.toFixed(2)}`;
  document.getElementById('kpi-total-count').innerText = `${invoices.length} Total Invoices`;

  // Today's Sales
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  
  const todayInvoices = invoices.filter(inv => new Date(inv.createdAt) >= startOfToday);
  const todaySales = todayInvoices.reduce((sum, inv) => sum + inv.total, 0);
  
  document.getElementById('kpi-today-sales').innerText = `₹${todaySales.toFixed(2)}`;
  document.getElementById('kpi-today-count').innerText = `${todayInvoices.length} Transactions`;

  // Low stock products count
  const lowStockCount = products.filter(p => p.stock < 5).length;
  document.getElementById('kpi-low-stock').innerText = lowStockCount;

  // Ledger Payment Split calculation
  let cashSum = 0;
  let upiSum = 0;
  let cardSum = 0;

  invoices.forEach(inv => {
    if (inv.paymentMode === 'Cash') cashSum += inv.total;
    else if (inv.paymentMode === 'UPI') upiSum += inv.total;
    else if (inv.paymentMode === 'Card') cardSum += inv.total;
  });

  document.getElementById('ledger-cash-val').innerText = `₹${cashSum.toFixed(2)}`;
  document.getElementById('ledger-upi-val').innerText = `₹${upiSum.toFixed(2)}`;
  document.getElementById('ledger-card-val').innerText = `₹${cardSum.toFixed(2)}`;

  const ledgerTotal = cashSum + upiSum + cardSum;
  if (ledgerTotal > 0) {
    document.getElementById('ledger-cash-bar').style.width = `${(cashSum / ledgerTotal) * 100}%`;
    document.getElementById('ledger-upi-bar').style.width = `${(upiSum / ledgerTotal) * 100}%`;
    document.getElementById('ledger-card-bar').style.width = `${(cardSum / ledgerTotal) * 100}%`;
  } else {
    document.getElementById('ledger-cash-bar').style.width = '0%';
    document.getElementById('ledger-upi-bar').style.width = '0%';
    document.getElementById('ledger-card-bar').style.width = '0%';
  }

  // Populate Registry Logs
  refreshInvoiceLogs();
}

async function refreshInvoiceLogs() {
  const tableBody = document.getElementById('invoice-logs-body');
  const searchQuery = document.getElementById('log-search').value.toLowerCase().trim();
  
  let invoices = await db.invoices.toArray();
  
  // Sort reverse chronological
  invoices.sort((a,b) => b.createdAt - a.createdAt);

  if (searchQuery) {
    invoices = invoices.filter(inv => 
      inv.invoiceNumber.toString().includes(searchQuery) ||
      inv.customerName.toLowerCase().includes(searchQuery) ||
      (inv.customerEmail && inv.customerEmail.toLowerCase().includes(searchQuery))
    );
  }

  tableBody.innerHTML = '';
  if (invoices.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No completed invoices found.</td></tr>`;
    return;
  }

  invoices.forEach(inv => {
    const formattedDate = new Date(inv.createdAt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric'
    });

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="text-white fw-bold">#${inv.invoiceNumber}</td>
      <td>
        <div class="text-white">${inv.customerName}</div>
        <small class="text-muted">${inv.customerGSTIN || 'URD (Unregistered)'}</small>
      </td>
      <td>${formattedDate}</td>
      <td><span class="badge bg-secondary">${inv.paymentMode}</span></td>
      <td class="text-white fw-bold">₹${inv.total.toFixed(2)}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-cyan border-0 me-2" onclick="downloadInvoicePDF(${inv.id})">
          <i data-lucide="download" style="width:16px;"></i>
        </button>
        <button class="btn btn-sm btn-outline-warning border-0" onclick="emailInvoice(${inv.id})">
          <i data-lucide="mail" style="width:16px;"></i>
        </button>
      </td>
    `;
    tableBody.appendChild(tr);
  });

  lucide.createIcons();
}

document.getElementById('log-search').addEventListener('input', refreshInvoiceLogs);

// -----------------------------------------
// POS Billing Checkout Operations
// -----------------------------------------
async function processCheckout() {
  if (currentCart.length === 0) {
    showToast("Billing cart is empty", "danger");
    return;
  }

  const custName = document.getElementById('cust-name').value.trim();
  const custAddress = document.getElementById('cust-address').value.trim();
  const custGSTIN = document.getElementById('cust-gstin').value.trim().toUpperCase();
  const custState = document.getElementById('cust-state').value;
  const custMobile = document.getElementById('cust-mobile').value.trim();
  const custEmail = document.getElementById('cust-email').value.trim();
  const transportCost = parseFloat(document.getElementById('transport-cost').value) || 0;
  const paymentMode = document.querySelector('input[name="payment-mode"]:checked').value;

  if (!custName) {
    showToast("Customer Name is required", "danger");
    return;
  }

  // Deduct stock of items locally in IndexedDB
  for (const item of currentCart) {
    const freshProd = await db.products.get(item.product.id);
    if (freshProd) {
      const remainingStock = Math.max(0, freshProd.stock - item.qty);
      await db.products.update(item.product.id, { stock: remainingStock });
    }
  }

  // Fetch sequential invoice number (starts at 1001 for clean professional layout)
  const totalInvoices = await db.invoices.count();
  const invoiceNumber = 1001 + totalInvoices;

  // Build calculation engine
  let itemsSubtotal = 0;
  currentCart.forEach(item => {
    itemsSubtotal += item.product.basePrice * item.qty;
  });

  let totalTaxAmt = 0;
  let totalCGST = 0;
  let totalSGST = 0;
  let totalIGST = 0;

  const isIntraState = (custState === "27");

  // Re-run allocation inside save logic to store correct values
  const savedItems = currentCart.map(item => {
    const itemSubtotal = item.product.basePrice * item.qty;
    let allocatedTransport = 0;
    if (itemsSubtotal > 0) {
      allocatedTransport = transportCost * (itemSubtotal / itemsSubtotal);
    }
    const compositeTaxable = itemSubtotal + allocatedTransport;
    const taxRate = item.gstOverride;
    const taxAmount = compositeTaxable * (taxRate / 100);

    totalTaxAmt += taxAmount;
    if (isIntraState) {
      totalCGST += taxAmount / 2;
      totalSGST += taxAmount / 2;
    } else {
      totalIGST += taxAmount;
    }

    return {
      productId: item.product.id,
      name: item.product.name,
      hsn: item.product.hsn,
      qty: item.qty,
      basePrice: item.product.basePrice,
      subtotal: itemSubtotal,
      allocatedTransport: allocatedTransport,
      compositeTaxable: compositeTaxable,
      gstRate: taxRate,
      taxAmount: taxAmount
    };
  });

  const grandTotal = itemsSubtotal + transportCost + totalTaxAmt;

  const invoiceRecord = {
    invoiceNumber,
    customerName: custName,
    customerAddress: custAddress,
    customerGSTIN: custGSTIN || "URD",
    customerState: custState,
    customerMobile: custMobile,
    customerEmail: custEmail,
    items: savedItems,
    transportationCharge: transportCost,
    subtotal: itemsSubtotal,
    cgst: totalCGST,
    sgst: totalSGST,
    igst: totalIGST,
    total: grandTotal,
    paymentMode,
    createdAt: Date.now()
  };

  const savedId = await db.invoices.add(invoiceRecord);
  showToast(`Invoice #${invoiceNumber} saved successfully`, 'success');

  // Trigger immediate PDF invoice generation & print/save dialog
  await buildAndDownloadPDF(invoiceRecord);

  // Trigger Brevo Email in the background if configured
  const emailSettings = await db.settings.get('email_relay');
  if (emailSettings && emailSettings.value.autoEmail && custEmail && emailSettings.value.key) {
    emailInvoice(savedId);
  }

  // Refresh data interfaces
  clearCart();
  refreshInventoryTable();
}

// -----------------------------------------
// Helper: Number to Indian Rupees Words
// -----------------------------------------
function numberToIndianWords(num) {
  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function g(n) {
    if (n < 20) return a[n];
    let digit = n % 10;
    return b[Math.floor(n / 10)] + (digit ? ' ' + a[digit] : '');
  }

  function c(n) {
    if (n < 100) return g(n);
    let digit = n % 100;
    return a[Math.floor(n / 100)] + ' Hundred' + (digit ? ' ' + g(digit) : '');
  }

  let amount = Math.floor(num);
  let paisa = Math.round((num - amount) * 100);

  if (amount === 0 && paisa === 0) return 'Words: Zero Rupees Only';

  let words = '';
  
  let crore = Math.floor(amount / 10000000);
  amount %= 10000000;
  if (crore > 0) {
    words += c(crore) + ' Crore ';
  }

  let lakh = Math.floor(amount / 100000);
  amount %= 100000;
  if (lakh > 0) {
    words += c(lakh) + ' Lakh ';
  }

  let thousand = Math.floor(amount / 1000);
  amount %= 1000;
  if (thousand > 0) {
    words += c(thousand) + ' Thousand ';
  }

  if (amount > 0) {
    words += c(amount);
  }

  let finalWords = 'Words: ' + words.trim();
  if (paisa > 0) {
    finalWords += ' and ' + g(paisa) + ' Paisa';
  }
  finalWords += ' Rupees Only';
  return finalWords;
}

// -----------------------------------------
// QuestPDF-like client-side PDF Invoice Generator Service
// -----------------------------------------
async function downloadInvoicePDF(id) {
  const inv = await db.invoices.get(id);
  if (inv) {
    buildAndDownloadPDF(inv);
  }
}

async function buildAndDownloadPDF(invoice) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4'
  });

  const supplierSetting = await db.settings.get('supplier_profile');
  const supplier = supplierSetting ? supplierSetting.value : DEFAULT_SUPPLIER;

  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;

  // 1. Watermark Background "a-onewaterarts"
  doc.setTextColor(242, 242, 242); // Faint light gray #F2F2F2 for watermark
  doc.setFontSize(44);
  doc.setFont('Helvetica', 'bold');
  
  doc.saveGraphicsState();
  doc.setGState(new doc.GState({ opacity: 0.75 }));
  doc.advancedAPI(doc => {
    doc.text('a-onewaterarts', pageWidth / 2, pageHeight / 2, {
      align: 'center',
      angle: -40
    });
  });
  doc.restoreGraphicsState();

  // Reset standard text styling
  doc.setTextColor(0, 0, 0);

  // 2. Center Header Section
  doc.setFontSize(24);
  doc.setFont('Helvetica', 'bold');
  doc.setTextColor(163, 0, 0); // Red bold centered title
  doc.text("A-One Waterart's", pageWidth / 2, 18, { align: 'center' });
  const brandWidth = doc.getTextWidth("A-One Waterart's");
  doc.setLineWidth(0.3);
  doc.line(pageWidth / 2 - brandWidth / 2, 19, pageWidth / 2 + brandWidth / 2, 19);

  // Sub-header details (underlined, centered, black font size 8)
  doc.setTextColor(0, 0, 0);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8);

  const taglineText = supplier.tagline || DEFAULT_SUPPLIER.tagline;
  const emailText = supplier.email || DEFAULT_SUPPLIER.email;
  const instagramText = supplier.instagram || DEFAULT_SUPPLIER.instagram;
  const addressText = supplier.address || DEFAULT_SUPPLIER.address;

  const lines = [taglineText, emailText, instagramText, addressText];

  let currentY = 24;
  lines.forEach(lineText => {
    doc.text(lineText, pageWidth / 2, currentY, { align: 'center' });
    const lineWidth = doc.getTextWidth(lineText);
    doc.line(pageWidth / 2 - lineWidth / 2, currentY + 0.8, pageWidth / 2 + lineWidth / 2, currentY + 0.8);
    currentY += 5;
  });

  // 3. TAX INVOICE Title Block
  doc.rect(14, 46, 182, 8);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TAX INVOICE', pageWidth / 2, 51.5, { align: 'center' });

  // 4. Billed To & Shipped From Side-by-side grids
  const startY = 58;
  doc.setFontSize(8);
  
  // Left Box (To Customer)
  doc.setFont('Helvetica', 'normal');
  doc.text('To', 14, startY - 2);

  // Draw Left Box Grid Lines
  doc.rect(14, startY, 91, 36);
  doc.line(36, startY, 36, startY + 36); // separator col
  doc.line(14, startY + 6, 105, startY + 6);
  doc.line(14, startY + 18, 105, startY + 18);
  doc.line(14, startY + 24, 105, startY + 24);
  doc.line(14, startY + 30, 105, startY + 30);

  // Left Box Content
  doc.setFont('Helvetica', 'normal');
  doc.text('Name:', 16, startY + 4);
  doc.setFont('Helvetica', 'bold');
  doc.text(invoice.customerName, 38, startY + 4);

  doc.setFont('Helvetica', 'normal');
  doc.text('Address:', 16, startY + 10);
  const splitCustAddr = doc.splitTextToSize(invoice.customerAddress || "N/A", 65);
  doc.text(splitCustAddr, 38, startY + 10);

  doc.setFont('Helvetica', 'normal');
  doc.text('State:', 16, startY + 22);
  const stateLabel = invoice.customerState === "27" ? "Maharashtra" : GST_STATE_MAP[invoice.customerState] ? GST_STATE_MAP[invoice.customerState].split(" (")[0] : "Other";
  doc.text(stateLabel, 38, startY + 22);

  doc.text('State:', 16, startY + 28);
  doc.text("State Code: " + invoice.customerState, 38, startY + 28);

  doc.text('GSTIN:', 16, startY + 34);
  doc.setFont('Helvetica', 'bold');
  doc.text(invoice.customerGSTIN || 'URD', 38, startY + 34);

  // Right Box (Supplier details)
  doc.rect(105, startY, 91, 36);
  doc.line(129, startY, 129, startY + 36); // separator col
  doc.line(105, startY + 6, 196, startY + 6);
  doc.line(105, startY + 18, 196, startY + 18);
  doc.line(105, startY + 24, 196, startY + 24);
  doc.line(105, startY + 30, 196, startY + 30);

  // Right Box Content
  const formattedDate = new Date(invoice.createdAt).toLocaleDateString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });

  doc.setFont('Helvetica', 'normal');
  doc.text('GSTIN:', 107, startY + 4);
  doc.setFont('Helvetica', 'bold');
  doc.text(supplier.gstin, 131, startY + 4);

  doc.setFont('Helvetica', 'normal');
  doc.text('Invoice Date:', 107, startY + 10);
  doc.text(formattedDate, 131, startY + 10);

  doc.text('Invoice no. :', 107, startY + 22);
  doc.setFont('Helvetica', 'bold');
  doc.text(invoice.invoiceNumber.toString(), 131, startY + 22);

  doc.setFont('Helvetica', 'normal');
  doc.text('State:', 107, startY + 28);
  doc.text(supplier.stateName, 131, startY + 28);

  doc.text('State Code:', 107, startY + 34);
  doc.text(supplier.stateCode, 131, startY + 34);

  // 5. Products Table
  const headers = [
    ['Sr.No', 'Description', 'HSN Code', 'Quantity', 'Rate', 'Amount']
  ];

  const tableRows = [];
  invoice.items.forEach((item, index) => {
    tableRows.push([
      index + 1,
      item.name,
      item.hsn,
      item.qty,
      item.basePrice.toFixed(2),
      item.subtotal.toFixed(2)
    ]);
  });

  // Render Table
  doc.autoTable({
    head: headers,
    body: tableRows,
    startY: startY + 42,
    theme: 'grid',
    headStyles: { 
      fillColor: [255, 255, 255], 
      textColor: [0, 0, 0], 
      fontStyle: 'bold', 
      fontSize: 8.5,
      lineColor: [0, 0, 0], 
      lineWidth: 0.15,
      halign: 'center' 
    },
    bodyStyles: { 
      fillColor: [255, 255, 255], 
      textColor: [0, 0, 0], 
      fontSize: 8,
      lineColor: [0, 0, 0], 
      lineWidth: 0.15 
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 85, halign: 'left' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 22, halign: 'center' },
      5: { cellWidth: 25, halign: 'center' }
    },
    styles: { overflow: 'linebreak' }
  });

  let tableEndY = doc.previousAutoTable.finalY;

  // Add page if spacing is tight
  if (tableEndY > pageHeight - 75) {
    doc.addPage();
    tableEndY = 20;
  }

  // 6. Manual Grid drawing for totals and tax rates
  doc.setLineWidth(0.15);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8.5);

  const isIntraState = (invoice.customerState === "27");

  // Transportation row
  doc.rect(14, tableEndY, 182, 6);
  doc.line(171, tableEndY, 171, tableEndY + 6);
  doc.text("Transportation", 14 + 117 / 2, tableEndY + 4.5, { align: "center" });
  doc.text(invoice.transportationCharge.toFixed(2), 194, tableEndY + 4.5, { align: "right" });

  // Total row
  tableEndY += 6;
  doc.rect(14, tableEndY, 182, 6);
  doc.line(171, tableEndY, 171, tableEndY + 6);
  doc.setFont('Helvetica', 'bold');
  doc.text("Total", 149 + 22 / 2, tableEndY + 4.5, { align: "center" });
  doc.text((invoice.subtotal + invoice.transportationCharge).toFixed(2), 194, tableEndY + 4.5, { align: "right" });

  const totalBase = invoice.subtotal + invoice.transportationCharge;

  if (isIntraState) {
    // CGST row
    tableEndY += 6;
    doc.rect(14, tableEndY, 182, 6);
    doc.line(171, tableEndY, 171, tableEndY + 6);
    doc.setFont('Helvetica', 'bold');
    
    const avgCgstRate = totalBase > 0 ? (invoice.cgst / totalBase) * 100 : 9;
    const formattedCgstRate = avgCgstRate.toFixed(1).replace(/\.0$/, '');
    
    doc.text(`CGST ${formattedCgstRate}%`, 149 + 22 / 2, tableEndY + 4.5, { align: "center" });
    doc.setFont('Helvetica', 'normal');
    doc.text(invoice.cgst.toFixed(2), 194, tableEndY + 4.5, { align: "right" });

    // SGST row
    tableEndY += 6;
    doc.rect(14, tableEndY, 182, 6);
    doc.line(171, tableEndY, 171, tableEndY + 6);
    doc.setFont('Helvetica', 'bold');
    doc.text(`SGST ${formattedCgstRate}%`, 149 + 22 / 2, tableEndY + 4.5, { align: "center" });
    doc.setFont('Helvetica', 'normal');
    doc.text(invoice.sgst.toFixed(2), 194, tableEndY + 4.5, { align: "right" });
  } else {
    // IGST row
    tableEndY += 6;
    doc.rect(14, tableEndY, 182, 6);
    doc.line(171, tableEndY, 171, tableEndY + 6);
    doc.setFont('Helvetica', 'bold');
    
    const avgIgstRate = totalBase > 0 ? (invoice.igst / totalBase) * 100 : 18;
    const formattedIgstRate = avgIgstRate.toFixed(1).replace(/\.0$/, '');

    doc.text(`IGST ${formattedIgstRate}%`, 149 + 22 / 2, tableEndY + 4.5, { align: "center" });
    doc.setFont('Helvetica', 'normal');
    doc.text(invoice.igst.toFixed(2), 194, tableEndY + 4.5, { align: "right" });

    // SGST empty spacing row (to align heights)
    tableEndY += 6;
    doc.rect(14, tableEndY, 182, 6);
    doc.line(171, tableEndY, 171, tableEndY + 6);
  }

  // Words & Grand Total row (Height = 12mm)
  tableEndY += 6;
  doc.rect(14, tableEndY, 182, 12);
  doc.line(131, tableEndY, 131, tableEndY + 12);
  doc.line(171, tableEndY, 171, tableEndY + 12);

  // Words display
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  const wordsVal = numberToIndianWords(invoice.total);
  const splitWords = doc.splitTextToSize(wordsVal, 113);
  doc.text(splitWords, 16, tableEndY + 5);

  // Total Amount text & value
  doc.setFontSize(9);
  doc.text("Total Amount", 151, tableEndY + 7, { align: "center" });
  doc.text(invoice.total.toFixed(2), 194, tableEndY + 7, { align: "right" });

  // 7. Bank Details & Thanking Side-by-Side Boxes
  let boxY = tableEndY + 18;
  if (boxY > pageHeight - 38) {
    doc.addPage();
    boxY = 20;
  }

  // Left Bank Box (double borders)
  doc.rect(14, boxY, 91, 30);
  doc.rect(15, boxY + 0.5, 89, 29);

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Bank Details :', 18, boxY + 6);
  doc.line(18, boxY + 6.5, 38, boxY + 6.5); // Underline

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  
  const bankLines = [
    `Name : ${supplier.name}`,
    `A/c. : ${supplier.bankAcc}`,
    `IFSC : ${supplier.bankIfsc}`
  ];

  let bankY = boxY + 11;
  bankLines.forEach(bl => {
    doc.text(bl, 18, bankY);
    const lineW = doc.getTextWidth(bl);
    doc.line(18, bankY + 0.5, 18 + lineW, bankY + 0.5);
    bankY += 4.5;
  });

  doc.text(`BANK: ${supplier.bankName}`, 18, bankY);
  doc.text(`Branch : ${supplier.bankBranch}.`, 18, bankY + 4);

  // Right Thanking Box (double borders)
  doc.rect(105, boxY, 91, 30);
  doc.rect(106, boxY + 0.5, 89, 29);

  doc.setFont('Helvetica', 'bolditalic');
  doc.setFontSize(9.5);
  doc.text('Thanking For', 150.5, boxY + 7, { align: 'center' });

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(supplier.name.toUpperCase(), 150.5, boxY + 13, { align: 'center' });
  const signW = doc.getTextWidth(supplier.name.toUpperCase());
  doc.line(150.5 - signW / 2, boxY + 13.8, 150.5 + signW / 2, boxY + 13.8);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Authorized Signatory', 150.5, boxY + 26, { align: 'center' });

  // Save/Download invoice
  doc.save(`Invoice_${invoice.invoiceNumber}.pdf`);
  
  return doc;
}

// -----------------------------------------
// Brevo SMTP Email Relay API Service
// -----------------------------------------
async function emailInvoice(id) {
  const inv = await db.invoices.get(id);
  const emailSettings = await db.settings.get('email_relay');
  
  if (!inv) {
    showToast("Invoice not found", "danger");
    return;
  }

  if (!emailSettings || !emailSettings.value.key) {
    showToast("Brevo API SMTP Key is not configured in Settings", "warning");
    return;
  }

  if (!inv.customerEmail) {
    showToast(`No email address supplied for customer ${inv.customerName}`, "warning");
    return;
  }

  showToast(`Initiating SMTP email trigger for #${inv.invoiceNumber}...`, "info");

  // Format invoice variables for transactional HTML layout
  const emailBody = `
    <h3>Tax Invoice #${inv.invoiceNumber}</h3>
    <p>Dear ${inv.customerName},</p>
    <p>Please find details of your recent purchase from A-One Waterart's below:</p>
    <ul>
      <li><strong>Invoice Number:</strong> #${inv.invoiceNumber}</li>
      <li><strong>Date:</strong> ${new Date(inv.createdAt).toLocaleDateString()}</li>
      <li><strong>Total Amount Paid:</strong> INR ${inv.total.toFixed(2)}</li>
      <li><strong>Payment Mode:</strong> ${inv.paymentMode}</li>
    </ul>
    <p>A digital PDF version of this tax invoice has been generated for your records.</p>
    <p>Thank you for choosing A-One Waterart's.</p>
  `;

  // Brevo API Request Payload
  const payload = {
    sender: { name: "A-One Waterarts Billing", email: emailSettings.value.sender },
    to: [{ email: inv.customerEmail, name: inv.customerName }],
    subject: `Tax Invoice #${inv.invoiceNumber} — A-One Waterart's`,
    htmlContent: emailBody
  };

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': emailSettings.value.key,
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      showToast(`Tax invoice emailed to ${inv.customerEmail} successfully!`, "success");
    } else {
      const errData = await res.json();
      throw new Error(errData.message || "Relay Failure");
    }
  } catch (err) {
    showToast(`Email relay failed: ${err.message}`, "danger");
    console.error(err);
  }
}

// -----------------------------------------
// Settings Management
// -----------------------------------------
async function loadSettingsForm() {
  const supplierSetting = await db.settings.get('supplier_profile');
  const supplier = supplierSetting ? supplierSetting.value : DEFAULT_SUPPLIER;

  document.getElementById('setup-supplier-name').value = supplier.name;
  document.getElementById('setup-supplier-gstin').value = supplier.gstin;
  document.getElementById('setup-supplier-addr').value = supplier.address;

  const emailSettings = await db.settings.get('email_relay');
  if (emailSettings) {
    document.getElementById('setup-brevo-key').value = emailSettings.value.key || '';
    document.getElementById('setup-brevo-sender').value = emailSettings.value.sender || 'billing@aonewaterarts.com';
    document.getElementById('setup-auto-email').checked = emailSettings.value.autoEmail || false;
  }
}

async function saveSupplierProfile() {
  const name = document.getElementById('setup-supplier-name').value.trim();
  const gstin = document.getElementById('setup-supplier-gstin').value.trim().toUpperCase();
  const address = document.getElementById('setup-supplier-addr').value.trim();

  if (!name || !gstin || !address) {
    showToast("Please fill in all Supplier Profile fields", "danger");
    return;
  }

  const profile = {
    ...DEFAULT_SUPPLIER,
    name,
    gstin,
    address
  };

  await db.settings.put({ key: 'supplier_profile', value: profile });
  showToast("Supplier Profile saved successfully", "success");
}

async function saveNewPIN() {
  const currPinInput = document.getElementById('settings-curr-pin');
  const newPinInput = document.getElementById('settings-new-pin');
  
  const currPin = currPinInput.value;
  const newPin = newPinInput.value;

  if (newPin.length !== 4 || isNaN(newPin)) {
    showToast("New PIN must be a 4-digit number", "danger");
    return;
  }

  const pinSetting = await db.settings.get('owner_pin');
  const actualCurrPin = pinSetting ? pinSetting.value : '1234';

  if (currPin === actualCurrPin) {
    await db.settings.put({ key: 'owner_pin', value: newPin });
    showToast("Terminal Owner PIN updated successfully", "success");
    currPinInput.value = '';
    newPinInput.value = '';
  } else {
    showToast("Current Owner PIN is incorrect", "danger");
  }
}

async function saveEmailRelaySettings() {
  // Bind simple change listeners on settings input
  const key = document.getElementById('setup-brevo-key').value.trim();
  const sender = document.getElementById('setup-brevo-sender').value.trim();
  const autoEmail = document.getElementById('setup-auto-email').checked;

  await db.settings.put({
    key: 'email_relay',
    value: { key, sender, autoEmail }
  });
}

// Bind settings toggle listeners
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('setup-brevo-key').addEventListener('change', saveEmailRelaySettings);
  document.getElementById('setup-brevo-sender').addEventListener('change', saveEmailRelaySettings);
  document.getElementById('setup-auto-email').addEventListener('change', saveEmailRelaySettings);
});

// -----------------------------------------
// Backup & Portability (Import/Export JSON)
// -----------------------------------------
async function exportDatabase() {
  try {
    const products = await db.products.toArray();
    const invoices = await db.invoices.toArray();
    const settings = await db.settings.toArray();

    const dbBackup = {
      version: 1,
      exportedAt: Date.now(),
      products,
      invoices,
      settings
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dbBackup));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    
    const formattedDate = new Date().toISOString().slice(0,10);
    downloadAnchor.setAttribute("download", `hydroflow_erp_backup_${formattedDate}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    showToast("Database exported successfully!", "success");
  } catch (err) {
    showToast("Failed to export database: " + err.message, "danger");
  }
}

function triggerImportFileInput() {
  document.getElementById('db-import-file').click();
}

async function importDatabase(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const backup = JSON.parse(e.target.result);
      
      if (!backup.products || !backup.invoices || !backup.settings) {
        throw new Error("Invalid backup file structure");
      }

      if (confirm("Importing this file will overwrite all current inventory, invoices, and settings. Proceed?")) {
        // Clear tables
        await db.products.clear();
        await db.invoices.clear();
        await db.settings.clear();

        // Populate tables
        await db.products.bulkAdd(backup.products);
        await db.invoices.bulkAdd(backup.invoices);
        
        for (const item of backup.settings) {
          await db.settings.put(item);
        }

        showToast("Database restored successfully!", "success");
        
        // Refresh display
        loadSettingsForm();
        refreshInventoryTable();
        refreshDashboard();
        
        // Re-authenticate if PIN changed
        const isStillValid = sessionStorage.getItem('hydroflow_unlocked');
        if (isStillValid) {
          sessionStorage.removeItem('hydroflow_unlocked');
          initPinVerification();
        }
      }
    } catch (err) {
      showToast("Error importing database: " + err.message, "danger");
    }
  };
  reader.readAsText(file);
}

// -----------------------------------------
// Global Notifications Toast Utility
// -----------------------------------------
function showToast(message, type = 'info') {
  // Create toast container if not exists
  let container = document.getElementById('toast-container-custom');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container-custom';
    container.style.position = 'fixed';
    container.style.bottom = '20px';
    container.style.right = '20px';
    container.style.zIndex = '10000';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `glass-panel p-3 text-white d-flex align-items-center justify-content-between rounded-3`;
  toast.style.minWidth = '280px';
  toast.style.borderLeft = `4px solid var(--accent-${type === 'danger' ? 'danger' : type === 'success' ? 'success' : 'cyan'})`;
  toast.style.animation = 'shake 0.3s ease';
  
  toast.innerHTML = `
    <div class="small fw-medium">${message}</div>
    <button class="btn btn-close btn-close-white ms-3 border-0 bg-transparent text-white" style="font-size: 0.75rem;" onclick="this.parentElement.remove()"></button>
  `;

  container.appendChild(toast);
  
  // Auto-remove after 4 seconds
  setTimeout(() => {
    if (toast.parentElement) {
      toast.remove();
    }
  }, 4000);
}
