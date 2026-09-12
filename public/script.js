(() => {
  const $ = (id) => document.getElementById(id);
  const API_URL = 'https://practical-miracle-production-003d.up.railway.app';
  const postJson = async (url, payload) => {
    const response = await fetch(`${API_URL}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  };

  // PAGE 2 — email verification
  const emailForm = $('emailForm');
  if (emailForm) {
    const emailInput = $('email');
    const sendBtn = $('sendBtn');
    const status = $('status');
    const otpSection = $('otpSection');
    const emailPreview = $('emailPreview');
    const verifyBtn = $('verifyBtn');
    const resendBtn = $('resendBtn');
    const devCode = $('devCode');
    const backBtn = $('backBtn');
    const otpBoxes = [...document.querySelectorAll('.otp')];
    let verified = false;
    let resendTimer = 0;

    const setStatus = (message, type = '') => {
      status.textContent = message;
      status.className = `status ${type}`.trim();
    };
    const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const setResendCooldown = (seconds = 30) => {
      resendTimer = seconds; resendBtn.disabled = true;
      const tick = () => { if (resendTimer <= 0) { resendBtn.disabled = false; resendBtn.textContent = 'Resend code'; return; } resendBtn.textContent = `Resend in ${resendTimer}s`; resendTimer -= 1; setTimeout(tick, 1000); };
      tick();
    };
    const clearOtp = () => { otpBoxes.forEach((box) => { box.value = ''; }); otpBoxes[0]?.focus(); };
    const sendCode = async () => {
      const email = emailInput.value.trim().toLowerCase();
      if (!validEmail(email)) { setStatus('Enter a valid email address.', 'error'); emailInput.focus(); return; }
      sendBtn.disabled = true; resendBtn.disabled = true; setStatus('Sending your verification code…');
      if (devCode) devCode.style.display = 'none';
      try {
        await postJson('/api/auth/send-otp', { email });
        emailPreview.textContent = email; otpSection.classList.add('visible'); clearOtp(); setStatus('Verification code sent. Check your inbox.', 'success'); setResendCooldown(30);
      } catch (error) { setStatus(error.message, 'error'); sendBtn.disabled = false; resendBtn.disabled = false; return; }
      sendBtn.disabled = false;
    };
    emailForm.addEventListener('submit', (event) => { event.preventDefault(); if (resendTimer > 0 || verified) return; sendCode(); });
    otpBoxes.forEach((box, index) => {
      box.addEventListener('input', () => { box.value = box.value.replace(/\D/g, '').slice(0, 1); if (box.value && otpBoxes[index + 1]) otpBoxes[index + 1].focus(); });
      box.addEventListener('keydown', (event) => { if (event.key === 'Backspace' && !box.value && otpBoxes[index - 1]) otpBoxes[index - 1].focus(); if (event.key === 'ArrowLeft' && otpBoxes[index - 1]) otpBoxes[index - 1].focus(); if (event.key === 'ArrowRight' && otpBoxes[index + 1]) otpBoxes[index + 1].focus(); if (event.key === 'Enter') verifyBtn.click(); });
      box.addEventListener('paste', (event) => { event.preventDefault(); const pasted = (event.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 4); pasted.split('').forEach((digit, i) => { if (otpBoxes[i]) otpBoxes[i].value = digit; }); otpBoxes[Math.min(pasted.length, 3)]?.focus(); });
    });
    verifyBtn.addEventListener('click', async () => {
      const email = emailInput.value.trim().toLowerCase(); const otp = otpBoxes.map((box) => box.value).join('');
      if (!validEmail(email)) { setStatus('Enter a valid email address first.', 'error'); return; }
      if (otp.length !== 4) { setStatus('Enter all 4 digits.', 'error'); otpBoxes.find((box) => !box.value)?.focus(); return; }
      verifyBtn.disabled = true; resendBtn.disabled = true; setStatus('Verifying your email…');
      try {
        const data = await postJson('/api/auth/verify-otp', { email, otp });
        verified = true; sessionStorage.setItem('lifeRpgVerifiedEmail', email); sessionStorage.setItem('lifeRpgOnboardingToken', data.onboardingToken || '');
        emailInput.readOnly = true; verifyBtn.textContent = 'Email verified ✓'; setStatus('Email verified. Opening your character setup…', 'success');
        setTimeout(() => { window.location.href = '/page3.html'; }, 650);
      } catch (error) { setStatus(error.message, 'error'); verifyBtn.disabled = false; resendBtn.disabled = resendTimer > 0; }
    });
    resendBtn.addEventListener('click', () => { if (resendTimer > 0 || verified) return; sendCode(); });
    backBtn.addEventListener('click', () => { window.location.href = '/page1.html'; });
    return;
  }

  // PAGE 3 — profile / account creation
  const profileForm = $('profileForm');
  if (!profileForm) return;

  const email = sessionStorage.getItem('lifeRpgVerifiedEmail') || '';
  const onboardingToken = sessionStorage.getItem('lifeRpgOnboardingToken') || '';
  const nameInput = $('name'); const birthDay = $('birthDay'); const birthMonth = $('birthMonth'); const birthYear = $('birthYear'); const ageInput = $('age');
  const usernamePreview = $('usernamePreview'); const photoInput = $('photo'); const photoPreview = $('photoPreview'); const passwordInput = $('password'); const confirmPassword = $('confirmPassword'); const strengthBar = $('strengthBar'); const strengthText = $('strengthText'); const status = $('status'); const createBtn = $('createBtn');

  if (!email || !onboardingToken) { window.location.href = '/page2.html'; return; }

  const updateUsername = () => {
    const letters = nameInput.value.trim().toLowerCase().replace(/[^a-z]/g, '');
    const dayValue = Number(birthDay.value || 0);
    const monthValue = Number(birthMonth.value || 0);
    if (letters.length < 1 || !dayValue || !monthValue) {
      usernamePreview.textContent = '—';
      return;
    }
    const prefix = letters.slice(0, 4).padEnd(4, 'x');
    const day = String(dayValue).padStart(2, '0');
    const month = String(monthValue).padStart(2, '0');
    usernamePreview.textContent = `${prefix}${day}${month}`;
  };

  const updateAge = () => {
    const y = Number(birthYear.value); const d = Number(birthDay.value); const m = Number(birthMonth.value);
    if (!y || !d || !m) return;
    const today = new Date(); const birth = new Date(y, m - 1, d); let age = today.getFullYear() - y;
    if (today < new Date(today.getFullYear(), m - 1, d)) age -= 1;
    if (age >= 0 && age <= 120) ageInput.value = age;
  };
  [nameInput,birthDay,birthMonth].forEach((el) => el.addEventListener('input', updateUsername));
  [birthDay,birthMonth,birthYear].forEach((el) => el.addEventListener('input', updateAge));

  photoInput.addEventListener('change', () => {
    const file = photoInput.files?.[0]; if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) { photoInput.value=''; status.textContent='Choose a PNG, JPG, JPEG, or WEBP image.'; status.className='status error'; return; }
    if (file.size > 5 * 1024 * 1024) { photoInput.value=''; status.textContent='Profile photo must be 5 MB or smaller.'; status.className='status error'; return; }
    photoPreview.src = URL.createObjectURL(file);
    status.textContent=''; status.className='status';
  });

  passwordInput.addEventListener('input', () => {
    const value = passwordInput.value; let score = 0;
    if (value.length >= 8) score += 25; if (/[a-z]/.test(value)) score += 20; if (/[A-Z]/.test(value)) score += 20; if (/\d/.test(value)) score += 20; if (/[^A-Za-z0-9]/.test(value)) score += 15;
    strengthBar.style.width = `${score}%`;
    strengthText.textContent = score < 50 ? 'Weak — add length, numbers, and symbols.' : score < 80 ? 'Good — add one more variety for a stronger password.' : 'Strong password.';
  });

  const fileToDataUrl = (file) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });

  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.textContent = ''; status.className = 'status';
    const password = passwordInput.value; const confirm = confirmPassword.value;
    if (password !== confirm) { status.textContent = 'Passwords do not match.'; status.className = 'status error'; return; }
    if (password.length < 8) { status.textContent = 'Password must be at least 8 characters.'; status.className = 'status error'; return; }
    if (!ageInput.value) { status.textContent = 'Enter a valid birth date/year so your age can be calculated.'; status.className = 'status error'; return; }
    const gender = document.querySelector('input[name=gender]:checked')?.value || '';
    if (!gender) { status.textContent = 'Select whether your character is male or female.'; status.className = 'status error'; return; }

    createBtn.disabled = true; createBtn.textContent = 'Creating your character…';
    try {
      let profilePhoto = null; const file = photoInput.files?.[0]; if (file) profilePhoto = { dataUrl: await fileToDataUrl(file) };
      const bday = Number(birthDay.value); const bmonth = Number(birthMonth.value); const byear = Number(birthYear.value);
      const birthDate = `${byear}-${String(bmonth).padStart(2,'0')}-${String(bday).padStart(2,'0')}`;
      const data = await postJson('/api/auth/create-account', {
        email, onboardingToken, name: nameInput.value.trim(), age: Number(ageInput.value), birthYear: byear, birthDay: bday, birthMonth: bmonth,
        birthDate, contact: $('contact').value.trim(), gender, password, profilePhoto,
      });
      sessionStorage.setItem('lifeRpgToken', data.token || ''); sessionStorage.setItem('lifeRpgUsername', data.user?.username || '');
      localStorage.setItem('lifeRpgToken', data.token || ''); localStorage.setItem('lifeRpgUsername', data.user?.username || '');
      sessionStorage.removeItem('lifeRpgOnboardingToken'); sessionStorage.removeItem('lifeRpgVerifiedEmail');
      status.textContent = `Account created. Welcome to LIFE RPG, ${data.user?.username}!`; status.className = 'status success';
      setTimeout(() => { window.location.href = '/'; }, 800);
    } catch (error) { status.textContent = error.message || 'Could not create your account.'; status.className = 'status error'; createBtn.disabled = false; createBtn.textContent = 'Create my LIFE RPG account ↗'; }
  });

  updateUsername();
})();
