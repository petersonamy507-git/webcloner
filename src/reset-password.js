const form = document.getElementById('resetForm');
const errorBox = document.getElementById('resetError');
const button = document.getElementById('resetBtn');
const token = new URLSearchParams(location.search).get('token') || '';

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove('d-none');
}

if (!token) {
  showError('This link is missing its reset code. Ask your administrator for a new link.');
  button.disabled = true;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.classList.add('d-none');
  const password = document.getElementById('password').value;
  if (password.length < 10) return showError('Use at least 10 characters.');
  if (password !== document.getElementById('confirm').value) return showError('The two passwords don’t match.');

  button.disabled = true;
  try {
    const res = await fetch('/api/auth/password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.error || 'Could not save the password.');
    // Drop the one-time token from the address bar and history.
    history.replaceState(null, '', '/reset-password.html');
    form.classList.add('d-none');
    document.getElementById('resetDone').classList.remove('d-none');
  } catch (err) {
    showError(err.message);
    button.disabled = false;
  }
});
