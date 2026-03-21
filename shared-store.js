/**
 * shared-store.js
 * Central data store shared across all pages.
 * In a real backend integration, replace STORE reads/writes with API calls.
 * Place this file at the ROOT level alongside index.html.
 */

window.STORE = window.STORE || (function () {

  const store = {
    users: [
      { id:1, firstname:'Rito',  mi:'M', lastname:'Santos',    contact:'09171234567', username:'rito',  password:'admin123', role:'admin',   status:'active',  created:'2024-01-10' },
      { id:2, firstname:'Tata',  mi:'L', lastname:'Reyes',     contact:'09181234567', username:'tata',  password:'admin123', role:'admin',   status:'active',  created:'2024-01-10' },
      { id:3, firstname:'Catherine', mi:'A', lastname:'Estomago',      contact:'09191234567', username:'katirin', password:'staff123', role:'cashier', status:'active',  created:'2024-02-14' },
      { id:4, firstname:'Juan',  mi:'D', lastname:'Dela Cruz', contact:'09201234567', username:'juan',  password:'staff123', role:'cashier', status:'active',  created:'2024-03-05' },
      { id:5, firstname:'Ana',   mi:'B', lastname:'Lim',       contact:'09211234567', username:'ana',   password:'staff123', role:'cashier', status:'inactive',created:'2024-04-20' },
    ],

    pendingUsers: [
      { id:1001, firstname:'Carlo',   mi:'R', lastname:'Magsino',  contact:'09321234567', username:'carlo',   password:'carlo123',   role:'cashier', status:'pending', created:'2025-07-12' },
      { id:1002, firstname:'Lovely',  mi:'S', lastname:'Bautista', contact:'09451234567', username:'lovely',  password:'lovely123',  role:'cashier', status:'pending', created:'2025-07-13' },
      { id:1003, firstname:'Ramon',   mi:'T', lastname:'Villanueva',contact:'09561234567', username:'ramon',   password:'ramon123',   role:'cashier', status:'pending', created:'2025-07-14' },
    ],

    products: [
      { id:1,  name:'Rice (5kg)',        category:'Grains',    price:280, qty:120, low_stock:20 },
      { id:2,  name:'Cooking Oil (1L)',  category:'Oil',       price:85,  qty:8,   low_stock:15 },
      { id:3,  name:'Sugar (1kg)',       category:'Condiment', price:65,  qty:55,  low_stock:10 },
      { id:4,  name:'Salt (500g)',       category:'Condiment', price:18,  qty:80,  low_stock:10 },
      { id:5,  name:'Canned Sardines',   category:'Canned',    price:35,  qty:200, low_stock:30 },
      { id:6,  name:'Eggs (dozen)',      category:'Dairy',     price:110, qty:5,   low_stock:10 },
      { id:7,  name:'Instant Noodles',   category:'Noodles',   price:12,  qty:350, low_stock:50 },
      { id:8,  name:'Soy Sauce (500ml)', category:'Condiment', price:38,  qty:45,  low_stock:10 },
      { id:9,  name:'Vinegar (500ml)',   category:'Condiment', price:28,  qty:40,  low_stock:10 },
      { id:10, name:'Powdered Milk',     category:'Dairy',     price:320, qty:22,  low_stock:8  },
    ],

    transactions: [
      { id:'TXN-001', cashierId:3, cashier:'Maria Cruz',     items:[{name:'Rice (5kg)',qty:2,price:280},{name:'Sugar (1kg)',qty:1,price:65}],         total:625, date:'2025-07-14', time:'09:14 AM' },
      { id:'TXN-002', cashierId:4, cashier:'Juan Dela Cruz', items:[{name:'Canned Sardines',qty:5,price:35},{name:'Instant Noodles',qty:3,price:12}], total:211, date:'2025-07-14', time:'10:45 AM' },
      { id:'TXN-003', cashierId:3, cashier:'Maria Cruz',     items:[{name:'Eggs (dozen)',qty:1,price:110},{name:'Cooking Oil (1L)',qty:1,price:85}],   total:195, date:'2025-07-14', time:'11:30 AM' },
      { id:'TXN-004', cashierId:4, cashier:'Juan Dela Cruz', items:[{name:'Powdered Milk',qty:1,price:320},{name:'Salt (500g)',qty:2,price:18}],       total:356, date:'2025-07-14', time:'01:02 PM' },
      { id:'TXN-005', cashierId:3, cashier:'Maria Cruz',     items:[{name:'Instant Noodles',qty:10,price:12},{name:'Soy Sauce (500ml)',qty:2,price:38}],total:196,date:'2025-07-13', time:'03:20 PM' },
      { id:'TXN-006', cashierId:4, cashier:'Juan Dela Cruz', items:[{name:'Rice (5kg)',qty:1,price:280}],                                              total:280, date:'2025-07-13', time:'04:55 PM' },
    ]
  };

  return store;
})();

/** Helper: get next ID for any array */
window.nextId = function(arr) {
  return arr.length ? Math.max(...arr.map(x => x.id)) + 1 : 1;
};

/** Helper: format peso */
window.formatPeso = function(n) {
  return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits:2, maximumFractionDigits:2 });
};

/** Helper: today's date string */
window.todayStr = function() {
  return new Date().toLocaleDateString('en-PH', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
};

/** Helper: current time string */
window.nowTime = function() {
  return new Date().toLocaleTimeString('en-PH', { hour:'2-digit', minute:'2-digit' });
};

/** Helper: low stock products */
window.lowStockProducts = function() {
  return STORE.products.filter(p => p.qty <= p.low_stock);
};

/** Guard: redirect to login if no session */
window.requireAuth = function(role) {
  const raw = sessionStorage.getItem('currentUser');
  if (!raw) { window.location.href = '../index.html'; return null; }
  const user = JSON.parse(raw);
  if (role && user.role !== role) {
    if (user.role === 'admin') window.location.href = '../admin/admin.html';
    else window.location.href = '../cashier/cashier.html';
    return null;
  }
  return user;
};
