/* MSW password reset UI; separate from existing sign-in flows. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const forms = ['signInForm','signUpForm','forgotPasswordForm','setNewPasswordForm'];
  let resetEmail = '';
  let resetToken = '';
  function show(id) {
    forms.forEach(name => { if ($(name)) $(name).hidden = name !== id; });
  }
  function back() {
    resetEmail = ''; resetToken = '';
    if (location.hash.startsWith('#password-reset=')) history.replaceState(null, '', location.pathname + location.search);
    $('signInTab')?.click();
    show('signInForm');
  }
  async function post(payload) {
    const url = String(window.APP_CONFIG?.GAS_URL || '').trim();
    if (!url) throw new Error('Google Apps Script URL tidak tersedia.');
    // Use backend's existing text/plain JSON transport.
    const response = await fetch(url, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(payload), cache:'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const result = await response.json();
    if (!result.success) throw new Error(result.message || 'Permintaan gagal.');
    return result;
  }
  function status(id, text) { if ($(id)) $(id).textContent = text; }
  function init() {
    ['signInTab','signUpTab'].forEach(id => $(id)?.addEventListener('click', () => {
      $('forgotPasswordForm').hidden = true; $('setNewPasswordForm').hidden = true;
    }));
    $('forgotPasswordButton')?.addEventListener('click', () => {
      $('resetRequestEmail').value = $('signInEmail')?.value || '';
      status('resetRequestStatus', ''); show('forgotPasswordForm');
    });
    $('resetBackButton')?.addEventListener('click', back);
    $('resetConfirmBackButton')?.addEventListener('click', back);
    $('forgotPasswordForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('sendResetButton'); button.disabled = true;
      status('resetRequestStatus', 'Mengirim permintaan...');
      try {
        const result = await post({ action:'REQUEST_PASSWORD_RESET', email:$('resetRequestEmail').value.trim() });
        status('resetRequestStatus', result.message || 'Jika email terdaftar, tautan akan dikirim.');
      } catch (error) { status('resetRequestStatus', error.message || 'Gagal mengirim permintaan.'); }
      finally { button.disabled = false; }
    });
    $('setNewPasswordForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const password = $('resetNewPassword').value;
      if (password !== $('resetConfirmPassword').value) return status('resetConfirmStatus', 'Konfirmasi password tidak sama.');
      if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) return status('resetConfirmStatus', 'Password belum memenuhi persyaratan.');
      const button = $('confirmResetButton'); button.disabled = true;
      status('resetConfirmStatus', 'Memperbarui password...');
      try {
        const result = await post({action:'CONFIRM_PASSWORD_RESET',email:resetEmail,resetToken,newPassword:password});
        $('resetNewPassword').value = ''; $('resetConfirmPassword').value = '';
        back(); status('accessGateStatus', result.message || 'Password berhasil diperbarui.');
      } catch (error) { status('resetConfirmStatus', error.message || 'Reset password gagal.'); }
      finally { button.disabled = false; }
    });
    if (location.hash.startsWith('#password-reset=')) {
      const raw = location.hash.slice('#password-reset='.length);
      // Remove sensitive token from address bar before any other navigation.
      history.replaceState(null, '', location.pathname + location.search);
      const match = raw.match(/^([^:]+):([a-f0-9]{64})$/i);
      if (match) {
        try { resetEmail = decodeURIComponent(match[1]); resetToken = match[2]; show('setNewPasswordForm'); }
        catch (_) { status('accessGateStatus', 'Tautan reset tidak valid.'); }
      } else status('accessGateStatus', 'Tautan reset tidak valid.');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
})();
