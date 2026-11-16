const form = document.getElementById('loginForm');
const errorBox = document.getElementById('loginError');
const button = document.getElementById('loginBtn');

function safeNext() {
  const next = new URLSearchParams(location.search).get('next') || '/';
  // Only same-site paths, never another origin.
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.classList.add('d-none');
  button.disabled = true;
  button.textContent = 'Signing in…';
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.error || 'Could not sign in.');
    location.replace(safeNext());
  } catch (err) {
    errorBox.textContent = err.message === 'Failed to fetch'
      ? 'Could not reach the server. Make sure the backend is running.'
      : err.message;
    errorBox.classList.remove('d-none');
    button.disabled = false;
    button.textContent = 'Sign in';
  }
});
