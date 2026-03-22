/**
 * script.js  (root level — used by index.html)
 * Login and Registration logic.
 * Calls the PHP backend via api.js (Auth object).
 */

'use strict';

function $(id) { return document.getElementById(id); }

function showAlert(id, msg, type = 'error') {
  const el = $(id);
  el.className = `alert alert-${type} show`;
  el.innerHTML = (type === 'error' ? '⚠ ' : '✓ ') + msg;
}

function hideAlert(id) { $(id).classList.remove('show'); }

function togglePw(inputId, btn) {
  const inp = $(inputId);
  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
  else { inp.type = 'password'; btn.textContent = '👁'; }
}

function switchTab(tab) {
  $('panel-login').classList.toggle('active', tab === 'login');
  $('panel-register').classList.toggle('active', tab === 'register');
  hideAlert('login-error');
  hideAlert('reg-error');
  hideAlert('reg-success');
  if (tab === 'register') goToStep1();
}

// ── STEP NAVIGATION ───────────────────────────────────────────────────────────

function goToStep1() {
  $('reg-step-1').style.display = '';
  $('reg-step-2').style.display = 'none';
  $('step-dot-1').className = 'step active';
  $('step-dot-2').className = 'step';
  $('step-line').className  = 'step-line';
  hideAlert('reg-error');
}

function goToStep2() {
  hideAlert('reg-error');
  const firstname = $('reg-firstname').value.trim();
  const lastname  = $('reg-lastname').value.trim();
  const contact   = $('reg-contact').value.trim();
  if (!firstname || !lastname || !contact) {
    showAlert('reg-error', 'Please fill in all required fields.');
    return;
  }
  $('reg-step-1').style.display = 'none';
  $('reg-step-2').style.display = '';
  $('step-dot-1').className = 'step done';
  $('step-dot-2').className = 'step active';
  $('step-line').className  = 'step-line done';
}

// ── LOADING STATE ─────────────────────────────────────────────────────────────

function setLoading(btnId, spinnerId, textId, loading) {
  $(btnId).disabled = loading;
  $(spinnerId).style.display = loading ? 'block' : 'none';
  $(textId).style.display    = loading ? 'none'  : 'inline';
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────

async function doLogin() {
  hideAlert('login-error');
  const username = $('login-username').value.trim();
  const password = $('login-password').value;

  if (!username || !password) {
    showAlert('login-error', 'Please enter your username and password.');
    return;
  }

  setLoading('login-btn', 'login-spinner', 'login-btn-text', true);

  try {
    const res = await Auth.login(username, password);

    if (!res.success) {
      showAlert('login-error', res.message);
      return;
    }

    const user = res.data;
    // Save to sessionStorage so dashboards can show the user's name
    sessionStorage.setItem('currentUser', JSON.stringify(user));

    // Redirect based on role
    if (user.role === 'admin') {
      window.location.href = 'admin/admin.html';
    } else {
      window.location.href = 'cashier/cashier.html';
    }

  } catch (err) {
    showAlert('login-error', 'Could not connect to server. Is Laragon running?');
    console.error(err);
  } finally {
    setLoading('login-btn', 'login-spinner', 'login-btn-text', false);
  }
}

// ── REGISTER ──────────────────────────────────────────────────────────────────

async function doRegister() {
  hideAlert('reg-error');
  hideAlert('reg-success');

  const firstname = $('reg-firstname').value.trim();
  const mi        = $('reg-mi').value.trim().toUpperCase();
  const lastname  = $('reg-lastname').value.trim();
  const contact   = $('reg-contact').value.trim();
  const username  = $('reg-username').value.trim();
  const password  = $('reg-password').value;
  const confirm   = $('reg-confirm').value;

  if (!firstname || !lastname || !contact || !username || !password) {
    showAlert('reg-error', 'Please fill in all required fields (*).');
    return;
  }
  if (password.length < 6) {
    showAlert('reg-error', 'Password must be at least 6 characters.');
    return;
  }
  if (password !== confirm) {
    showAlert('reg-error', 'Passwords do not match.');
    return;
  }

  setLoading('reg-btn', 'reg-spinner', 'reg-btn-text', true);

  try {
    const res = await Auth.register({ firstname, mi, lastname, contact, username, password });

    if (!res.success) {
      showAlert('reg-error', res.message);
      return;
    }

    showAlert('reg-success', res.message, 'success');
    // Clear all fields and go back to step 1
    ['reg-firstname','reg-mi','reg-lastname','reg-contact',
     'reg-username','reg-password','reg-confirm'].forEach(id => $(id).value = '');
    goToStep1();

  } catch (err) {
    showAlert('reg-error', 'Could not connect to server. Is Laragon running?');
    console.error(err);
  } finally {
    setLoading('reg-btn', 'reg-spinner', 'reg-btn-text', false);
  }
}

// ── ENTER KEY ─────────────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if ($('panel-login').classList.contains('active')) doLogin();
  else doRegister();
});
