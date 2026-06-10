// Test Suite for HydroFlow ERP Calculation Logic
// Run with: node test.js

const assert = require('assert');

// Test Config
const GST_STATE_MAP = {
  "27": "Maharashtra",
  "24": "Gujarat"
};

function runTaxEngineTest({ cart, transportCost, customerState }) {
  // Calculate Subtotal (sum of base price * qty)
  let itemsSubtotal = 0;
  cart.forEach(item => {
    itemsSubtotal += item.product.basePrice * item.qty;
  });

  let totalTaxAmt = 0;
  let totalCGST = 0;
  let totalSGST = 0;
  let totalIGST = 0;

  const isIntraState = (customerState === "27");

  const results = cart.map(item => {
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

    return {
      name: item.product.name,
      subtotal: itemSubtotal,
      allocatedTransport,
      compositeTaxable,
      taxAmount
    };
  });

  const grandTotal = itemsSubtotal + transportCost + totalTaxAmt;

  return {
    itemsSubtotal,
    allocatedItems: results,
    totalCGST,
    totalSGST,
    totalIGST,
    totalTaxAmt,
    grandTotal
  };
}

// ----------------------------------------------------
// TEST RUNS
// ----------------------------------------------------
console.log("Starting HydroFlow ERP calculation tests...");

// Test Case 1: Intra-state (Maharashtra - 27) with Proportional Transportation
// Item A: 100 base price, Qty 2, 18% GST -> Subtotal 200
// Item B: 300 base price, Qty 1, 12% GST -> Subtotal 300
// Total Subtotal = 500
// Transportation = 50
// Item A allocation: 50 * (200 / 500) = 20 -> Composite value = 220. GST (18%) = 39.60
// Item B allocation: 50 * (300 / 500) = 30 -> Composite value = 330. GST (12%) = 39.60
// Total Tax = 39.60 + 39.60 = 79.20
// Since Intra-state: CGST = 39.60, SGST = 39.60, IGST = 0
// Grand Total = 500 (items) + 50 (transport) + 79.20 (tax) = 629.20

const cartCase1 = [
  { product: { name: "Pump A", basePrice: 100 }, qty: 2, gstOverride: 18 },
  { product: { name: "Fitting B", basePrice: 300 }, qty: 1, gstOverride: 12 }
];

const res1 = runTaxEngineTest({
  cart: cartCase1,
  transportCost: 50,
  customerState: "27"
});

assert.strictEqual(res1.itemsSubtotal, 500, "Subtotal should be 500");
assert.strictEqual(res1.allocatedItems[0].allocatedTransport, 20, "Item A transport allocation should be 20");
assert.strictEqual(res1.allocatedItems[1].allocatedTransport, 30, "Item B transport allocation should be 30");
assert.strictEqual(res1.allocatedItems[0].compositeTaxable, 220, "Item A composite taxable should be 220");
assert.strictEqual(res1.allocatedItems[1].compositeTaxable, 330, "Item B composite taxable should be 330");
assert.strictEqual(res1.totalCGST, 39.6, "CGST should be 39.60");
assert.strictEqual(res1.totalSGST, 39.6, "SGST should be 39.60");
assert.strictEqual(res1.totalIGST, 0, "IGST should be 0 for Maharashtra");
assert.strictEqual(res1.grandTotal, 629.2, "Grand total should be 629.20");

console.log("✔ Test Case 1 passed (Intra-state proportional tax allocation)");

// Test Case 2: Inter-state (Gujarat - 24) with Proportional Transportation
// Cart same, but customerState is "24"
// IGST should be 79.20, CGST/SGST should be 0

const res2 = runTaxEngineTest({
  cart: cartCase1,
  transportCost: 50,
  customerState: "24"
});

assert.strictEqual(res2.totalCGST, 0, "CGST should be 0 for Gujarat");
assert.strictEqual(res2.totalSGST, 0, "SGST should be 0 for Gujarat");
assert.strictEqual(res2.totalIGST, 79.2, "IGST should be 79.20 for Gujarat");
assert.strictEqual(res2.grandTotal, 629.2, "Grand total should be 629.20");

console.log("✔ Test Case 2 passed (Inter-state proportional tax allocation)");

console.log("All calculation tests completed successfully!");
