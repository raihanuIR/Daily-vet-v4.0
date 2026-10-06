// ============================================
// DAILYVET — AUTHENTICATION (Complete)
// Login | Register (User + Vet) | Password Reset
// Logout | Auth Guard | Profile pic | Password toggle
// ✅ SHA-256 + salt | ✅ Persistent login (localStorage)
// ============================================

document.addEventListener('DOMContentLoaded', function () {

    // =============================================
    // STEP 0: SET PERSISTENCE
    // =============================================
    (async function () {
        try {
            await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        } catch (e) {
            console.warn('Persistence failed:', e);
        }
    })();

    // =============================================
    // HELPERS
    // =============================================
    const PROTECTED_PAGES = [
        'home.html', 'profile.html', 'chat.html',
        'pet-detail.html', 'vet-list.html', 'vaccine.html',
        'boarding.html', 'medicine-scan.html', 'ambulance.html',
        'community.html',
        'ai.html', 'advisor.html', 'pharma.html',
        'pr-scanner.html', 'scanner.html',
        'vet-home.html'
    ];

    function getUserPhone() {
        return localStorage.getItem('userPhone') || sessionStorage.getItem('userPhone') || null;
    }

    function getUserName() {
        return localStorage.getItem('userName') || sessionStorage.getItem('userName') || 'User';
    }

    function setUserAuth(phone, name) {
        if (phone) {
            localStorage.setItem('userPhone', phone);
            sessionStorage.setItem('userPhone', phone);
        }
        if (name !== undefined && name !== null) {
            localStorage.setItem('userName', name);
            sessionStorage.setItem('userName', name);
        }
    }

    function clearUserAuth() {
        try {
            localStorage.removeItem('userPhone');
            localStorage.removeItem('userName');
            localStorage.removeItem('userProfileCache');
            localStorage.removeItem('pendingGoogleLogin');
        } catch (e) {}
        sessionStorage.clear();
    }

    window.getUserPhone = getUserPhone;
    window.getUserName = getUserName;
    window.setUserAuth = setUserAuth;
    window.clearUserAuth = clearUserAuth;

    /* ---------- Password Hash (SHA-256 + salt) ---------- */
    async function hashPassword(password, existingSalt = null) {
        const salt = existingSalt || Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map(b => b.toString(16).padStart(2, '0')).join('');

        const encoder = new TextEncoder();
        const data = encoder.encode(password + salt);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        return { hash, salt };
    }

    /* ---------- Expected digit range for selected country ---------- */
    function getExpectedPhoneRange() {
        const iso = (window.selectedCountry && window.selectedCountry.iso) || 'BD';
        return (window.PHONE_LENGTH_RANGES && window.PHONE_LENGTH_RANGES[iso]) || { min: 7, max: 12 };
    }

    /* ---------- Validate phone length against selected country, with a clear message ---------- */
    function validatePhoneLength(phone) {
        const { min, max } = getExpectedPhoneRange();
        if (phone.length < min || phone.length > max) {
            const countryName = (window.selectedCountry && window.selectedCountry.name) || 'your country';
            const expected = min === max ? `exactly ${min} digits` : `${min}–${max} digits`;
            alert(
                `❌ Invalid mobile number.\n\n${countryName} numbers must be ${expected} ` +
                `(you entered ${phone.length}).\n\nPlease correct the number.`
            );
            return false;
        }
        return true;
    }

    /* ---------- Get full phone — works on ALL pages ---------- */
    function getFullPhone() {
        const phoneEl = document.getElementById('phoneInput') ||
                        document.getElementById('mobile') ||
                        document.getElementById('loginPhone') ||
                        document.getElementById('resetPhone');

        if (!phoneEl) {
            console.warn('No phone input found on this page');
            return { phone: '', fullPhone: '' };
        }

        let phone = phoneEl.value.trim().replace(/\D/g, '');
        if (phone.startsWith('0')) phone = phone.slice(1);
        if (phone.startsWith('880')) phone = phone.slice(3);

        const code = (window.selectedCountry && window.selectedCountry.code)
            ? window.selectedCountry.code
            : '+880';

        const fullPhone = code + phone;
        return { phone, fullPhone };
    }

    /* ---------- Ensure a real Firebase Auth session ---------- */
    async function ensureAnonymousAuth() {
        try {
            if (!firebase.auth().currentUser) {
                await firebase.auth().signInAnonymously();
            }
        } catch (e) {
            console.warn('Anonymous auth failed:', e);
        }
    }

    /* ---------- Set loading state ---------- */
    function setLoading(btn, loading, defaultHTML) {
        if (!btn) return;
        btn.disabled = loading;
        btn.innerHTML = loading
            ? '<i class="fas fa-spinner fa-spin"></i> <span>Please wait...</span>'
            : defaultHTML;
    }

    /* ---------- Compress image → Base64 ---------- */
    function compressImageToBase64(file, maxWidth = 300, quality = 0.7) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width, height = img.height;
                    if (width > maxWidth) {
                        height = (maxWidth / width) * height;
                        width = maxWidth;
                    }
                    canvas.width = width;
                    canvas.height = height;
                    canvas.getContext('2d').drawImage(img, 0, 0, width, height);

                    // Base64 via Blob (for compression check)
                    canvas.toBlob((blob) => {
                        if (!blob) return reject(new Error('Compression failed'));
                        const reader2 = new FileReader();
                        reader2.onloadend = () => resolve(reader2.result);
                        reader2.onerror = reject;
                        reader2.readAsDataURL(blob);
                    }, 'image/jpeg', quality);
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // =============================================
    // STEP 1: USER REGISTER (account.html)
    // =============================================
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const fullName = document.getElementById('fullName').value.trim();
            const { phone, fullPhone } = getFullPhone();
            const password = document.getElementById('password').value;
            const confirm = document.getElementById('confirmPassword').value;
            const city = (document.getElementById('city')?.value || '').trim();
            const area = (document.getElementById('area')?.value || '').trim();

            const petsHidden = document.getElementById('petsHidden');
            const petsArray = petsHidden && petsHidden.value
                ? petsHidden.value.split(',').map(s => s.trim()).filter(Boolean)
                : [];
            const petType = petsArray[0] || '';

            if (fullName.length < 2)    { alert('Enter your full name'); return; }
            if (!validatePhoneLength(phone)) return;
            if (password.length < 6)    { alert('Password must be at least 6 characters'); return; }
            if (password !== confirm)   { alert('Passwords do not match'); return; }
            if (petsArray.length === 0) { alert('Please add at least one pet'); return; }
            if (!city || !area)         { alert('Please fill in city and area'); return; }

            const btn = registerForm.querySelector('button[type="submit"]') ||
                        document.getElementById('registerBtn');
            const originalHTML = btn ? btn.innerHTML : '';
            setLoading(btn, true, originalHTML);

            try {
                const userRef = firebase.firestore().collection('users').doc(fullPhone);

                if ((await userRef.get()).exists) {
                    alert('⚠️ This phone number is already registered.\n\nPlease login instead.');
                    setLoading(btn, false, originalHTML);
                    setTimeout(() => { window.location.href = 'login.html'; }, 800);
                    return;
                }

                try {
                    if ((await firebase.firestore().collection('vets').doc(fullPhone).get()).exists) {
                        alert('⚠️ This phone number is registered as a vet.\n\nPlease use Vet Login instead.');
                        setLoading(btn, false, originalHTML);
                        setTimeout(() => { window.location.href = 'vet-login.html'; }, 800);
                        return;
                    }
                } catch (vetErr) { console.warn('Vet check skipped:', vetErr); }

                const hashed = await hashPassword(password);

                // ✅ Base64 profile pic (no Firebase Storage needed)
                let photoURL = '';
                const fileInput = document.getElementById('profilePic');
                if (fileInput && fileInput.files && fileInput.files[0]) {
                    try {
                        const base64 = await compressImageToBase64(fileInput.files[0], 300, 0.7);
                        photoURL = base64;
                    } catch (err) {
                        console.warn('Profile pic skipped:', err);
                    }
                }

                await userRef.set({
                    name: fullName,
                    phone: fullPhone,
                    country: window.selectedCountry ? window.selectedCountry.iso : 'BD',
                    pets: petsArray,
                    petType: petType,
                    city: city,
                    area: area,
                    photoURL: photoURL,
                    password: hashed,
                    role: 'user',
                    verified: false,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                });

                setUserAuth(fullPhone, fullName);
                await ensureAnonymousAuth();

                alert('✅ Account created successfully!');
                window.location.href = 'home.html';

            } catch (err) {
                console.error('Register error:', err);
                alert('Failed to create account. Please try again.');
                setLoading(btn, false, originalHTML);
            }
        });
    }

    // =============================================
    // STEP 1B: VET REGISTER (vet-login.html)
    // =============================================
    const vetForm = document.getElementById('vetForm');
    if (vetForm) {
        vetForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const fullName = document.getElementById('fullName').value.trim();
            const { phone, fullPhone } = getFullPhone();
            const password = document.getElementById('password').value;
            const confirm = document.getElementById('confirmPassword').value;
            const city = (document.getElementById('city')?.value || '').trim();
            const area = (document.getElementById('area')?.value || '').trim();
            const treatments = Array.from(
                document.querySelectorAll('#treatmentGroup input[type="checkbox"]:checked')
            ).map(c => c.value);
            const institute = document.getElementById('institute').value;
            const speciality = document.getElementById('speciality').value;

            if (!validatePhoneLength(phone)) return;
            if (password.length < 6)   { alert('Password must be at least 6 characters'); return; }
            if (password !== confirm)  { alert('Passwords do not match'); return; }
            if (treatments.length === 0) { alert('Select at least one pet you treat'); return; }
            if (!city || !area)        { alert('Please fill in city and area'); return; }
            if (!institute)            { alert('Select your institute'); return; }
            if (!speciality)           { alert('Select your speciality'); return; }

            const btn = document.getElementById('registerBtn') ||
                        vetForm.querySelector('button[type="submit"]');
            const originalHTML = btn ? btn.innerHTML : '';
            setLoading(btn, true, originalHTML);

            try {
                const vetRef = firebase.firestore().collection('vets').doc(fullPhone);

                if ((await vetRef.get()).exists) {
                    alert('⚠️ A vet account already exists with this number.\n\nPlease login instead.');
                    setLoading(btn, false, originalHTML);
                    setTimeout(() => { window.location.href = 'vet-login.html'; }, 800);
                    return;
                }

                // ⚠️ Allow dual account: user + vet with same phone
                // (users collection may already have this phone — that's OK)

                const hashed = await hashPassword(password);

                // ✅ Base64 profile pic (no Firebase Storage)
                let photoURL = '';
                const fileInput = document.getElementById('profilePic');
                if (fileInput && fileInput.files && fileInput.files[0]) {
                    try {
                        const base64 = await compressImageToBase64(fileInput.files[0], 400, 0.75);
                        photoURL = base64;
                    } catch (err) {
                        console.warn('Vet pic skipped:', err);
                    }
                }

                await vetRef.set({
                    name: fullName,
                    phone: fullPhone,
                    country: window.selectedCountry ? window.selectedCountry.iso : 'BD',
                    treatments: treatments,
                    institute: institute,
                    speciality: speciality,
                    city: city,
                    area: area,
                    photoURL: photoURL,
                    password: hashed,
                    available: true,
                    verified: false,
                    role: 'vet',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                });

                // ✅ Persistent login for vet (also as user for navigation)
                localStorage.setItem('vetPhone', fullPhone);
                localStorage.setItem('vetName', fullName);
                sessionStorage.setItem('vetPhone', fullPhone);
                sessionStorage.setItem('vetName', fullName);

                // ✅ Also set as user so navigation/auth-guard works
                setUserAuth(fullPhone, fullName);

                await ensureAnonymousAuth();

                alert('✅ Registration successful!\n\nWelcome to Vet Dashboard.');
                window.location.href = 'vet-home.html';

            } catch (err) {
                console.error('Vet register error:', err);
                alert('Registration failed. Try again.');
                setLoading(btn, false, originalHTML);
            }
        });
    }

    // =============================================
    // STEP 2: LOGIN (login.html) — checks users then vets
    // =============================================
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            await performLogin();
        });
    }

    window.handleLogin = async function () {
        await performLogin();
    };

    async function performLogin() {
        const { phone, fullPhone } = getFullPhone();
        const passwordEl = document.getElementById('passwordInput') ||
                           document.getElementById('loginPassword');
        const password = passwordEl ? passwordEl.value : '';

        if (phone.length < 6) {
            alert('Enter a valid phone number');
            return;
        }
        if (password.length < 4) {
            alert('Enter your password');
            return;
        }

        const btn = document.getElementById('loginBtn') ||
                    (loginForm ? loginForm.querySelector('button[type="submit"]') : null);
        const originalHTML = btn ? btn.innerHTML : '';
        setLoading(btn, true, originalHTML);

        try {
            // ✅ Check users collection first
            const userRef = firebase.firestore().collection('users').doc(fullPhone);
            const userDoc = await userRef.get();

            if (userDoc.exists) {
                const userData = userDoc.data();

                if (!userData.password || typeof userData.password !== 'object' || !userData.password.salt) {
                    alert('⚠️ This account was created with an old version.\n\nPlease delete and recreate.');
                    setLoading(btn, false, originalHTML);
                    return;
                }

                const inputHash = await hashPassword(password, userData.password.salt);

                if (inputHash.hash === userData.password.hash) {
                    await userRef.update({
                        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    setUserAuth(fullPhone, userData.name || '');
                    await ensureAnonymousAuth();

                    window.location.href = 'home.html';
                    return;
                } else {
                    alert('❌ Wrong password. Please try again.');
                    if (passwordEl) { passwordEl.value = ''; passwordEl.focus(); }
                    setLoading(btn, false, originalHTML);
                    return;
                }
            }

            // ✅ No user account — check vets collection
            const vetDoc = await firebase.firestore().collection('vets').doc(fullPhone).get();
            if (vetDoc.exists) {
                const vetData = vetDoc.data();

                if (!vetData.password || typeof vetData.password !== 'object' || !vetData.password.salt) {
                    alert('⚠️ This vet account uses an older format.');
                    setLoading(btn, false, originalHTML);
                    return;
                }

                const inputHash = await hashPassword(password, vetData.password.salt);

                if (inputHash.hash === vetData.password.hash) {
                    await firebase.firestore().collection('vets').doc(fullPhone).update({
                        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    localStorage.setItem('vetPhone', fullPhone);
                    localStorage.setItem('vetName', vetData.name || '');
                    sessionStorage.setItem('vetPhone', fullPhone);
                    sessionStorage.setItem('vetName', vetData.name || '');
                    setUserAuth(fullPhone, vetData.name || '');

                    await ensureAnonymousAuth();
                    window.location.href = 'vet-home.html';
                    return;
                } else {
                    alert('❌ Wrong password. Please try again.');
                    if (passwordEl) { passwordEl.value = ''; passwordEl.focus(); }
                    setLoading(btn, false, originalHTML);
                    return;
                }
            }

            // ❌ Neither user nor vet
            alert('❌ No account found with this number.\n\nPlease create an account.');
            setLoading(btn, false, originalHTML);

        } catch (err) {
            console.error(err);
            alert('Login failed. Please try again.');
            setLoading(btn, false, originalHTML);
        }
    }

    // =============================================
    // STEP 3: CONTINUE WITH PHONE
    // =============================================
    window.loginWithPhone = function () {
        const { phone, fullPhone } = getFullPhone();

        if (phone.length < 6) {
            alert('Please enter your phone number first');
            const el = document.getElementById('phoneInput') ||
                       document.getElementById('loginPhone');
            if (el) el.focus();
            return;
        }

        sessionStorage.setItem('resetPhone', fullPhone);
        window.location.href = 'forgot-password.html';
    };

    // =============================================
    // STEP 4: FORGOT PASSWORD
    // =============================================
    window.forgotPassword = function (event) {
        if (event) event.preventDefault();

        const { phone, fullPhone } = getFullPhone();

        if (phone.length < 6) {
            alert('Enter your phone number first, then click Forgot Password');
            const el = document.getElementById('phoneInput') ||
                       document.getElementById('loginPhone');
            if (el) el.focus();
            return;
        }

        sessionStorage.setItem('resetPhone', fullPhone);
        window.location.href = 'forgot-password.html';
    };

    // =============================================
    // STEP 5: RESET PASSWORD (forgot-password.html)
    // =============================================
    const resetForm = document.getElementById('resetForm');
    if (resetForm) {
        const saved = sessionStorage.getItem('resetPhone');
        if (saved) {
            const phoneField = document.getElementById('resetPhone');
            if (phoneField) {
                const digits = saved.replace(/\D/g, '');
                phoneField.value = digits.startsWith('880') ? digits.slice(3) : digits;
            }
        }

        resetForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const { phone, fullPhone } = getFullPhone();
            const newPassEl = document.getElementById('newPassword');
            const confirmEl = document.getElementById('confirmPassword');

            const newPass = newPassEl ? newPassEl.value : '';
            const confirm = confirmEl ? confirmEl.value : '';

            if (phone.length < 6)    { alert('Enter a valid phone number'); return; }
            if (newPass.length < 6)  { alert('Password must be at least 6 characters'); return; }
            if (newPass !== confirm) { alert('Passwords do not match'); return; }

            const btn = resetForm.querySelector('button[type="submit"]');
            const originalHTML = btn ? btn.innerHTML : '';
            setLoading(btn, true, originalHTML);

            try {
                const userRef = firebase.firestore().collection('users').doc(fullPhone);
                const userDoc = await userRef.get();

                if (!userDoc.exists) {
                    alert('No account found with this number');
                    setLoading(btn, false, originalHTML);
                    return;
                }

                const hashed = await hashPassword(newPass);
                await userRef.update({
                    password: hashed,
                    passwordChangedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                alert('✅ Password reset successfully! Please login.');
                sessionStorage.removeItem('resetPhone');
                window.location.href = 'login.html';

            } catch (err) {
                console.error(err);
                alert('Failed to reset password. Try again.');
                setLoading(btn, false, originalHTML);
            }
        });
    }

    // =============================================
    // STEP 7: LOGOUT
    // =============================================
    window.logout = function () {
        if (!confirm('Logout from DailyVet?')) return;
        clearUserAuth();
        try {
            localStorage.removeItem('vetPhone');
            localStorage.removeItem('vetName');
        } catch (e) {}
        window.location.href = 'login.html';
    };

    // =============================================
    // STEP 7B: UNIVERSAL PROFILE DROPDOWN MENU
    // =============================================
    function refreshProfileDropdownInfo() {
        try {
            const name = getUserName ? getUserName() : (sessionStorage.getItem('userName') || localStorage.getItem('userName') || 'User');
            const isVet = localStorage.getItem('vetPhone') || sessionStorage.getItem('vetPhone');

            const nameEl = document.getElementById('profileMenuName');
            if (nameEl && name) nameEl.textContent = name;

            const roleEl = document.getElementById('profileMenuRole');
            if (roleEl) {
                roleEl.textContent = isVet ? 'Registered Veterinarian' : 'Pet & Farm Owner';
            }

            const avatarEl = document.getElementById('profileMenuAvatar');
            const mainIcon = document.getElementById('profileIconImg');
            if (avatarEl && mainIcon && mainIcon.src) {
                avatarEl.src = mainIcon.src;
            }

            // Sync Mobile Sandwich Drawer user info
            const mobNameEl = document.getElementById('mobileMenuName');
            if (mobNameEl && name) mobNameEl.textContent = name;

            const mobRoleEl = document.getElementById('mobileMenuRole');
            if (mobRoleEl) {
                mobRoleEl.textContent = isVet ? 'Registered Veterinarian' : 'Pet & Farm Owner';
            }

            const mobAvatarEl = document.getElementById('mobileMenuAvatar');
            if (mobAvatarEl && mainIcon && mainIcon.src) {
                mobAvatarEl.src = mainIcon.src;
            }
        } catch (e) {
            console.warn('Profile dropdown info refresh:', e);
        }
    }
    window.refreshProfileDropdownInfo = refreshProfileDropdownInfo;

    window.toggleProfileDropdown = function (event) {
        if (event) {
            if (typeof event.stopPropagation === 'function') event.stopPropagation();
            if (typeof event.preventDefault === 'function') event.preventDefault();
        }
        const dropdown = document.getElementById('profileDropdown');
        const btn = document.getElementById('profileDropdownBtn');
        if (!dropdown) return;

        // Mutual exclusion: Close notification dropdown & mobile sandwich menu if open
        const notifDropdown = document.getElementById('notificationDropdown');
        if (notifDropdown) notifDropdown.style.display = 'none';
        if (window.closeMobileSandwichMenu) window.closeMobileSandwichMenu();

        const isHidden = dropdown.classList.contains('hidden') || dropdown.style.display === 'none' || !dropdown.style.display;
        if (isHidden) {
            dropdown.classList.remove('hidden');
            dropdown.style.display = 'block';
            dropdown.classList.add('open');
            if (btn) btn.setAttribute('aria-expanded', 'true');
            refreshProfileDropdownInfo();
        } else {
            dropdown.classList.add('hidden');
            dropdown.style.display = 'none';
            dropdown.classList.remove('open');
            if (btn) btn.setAttribute('aria-expanded', 'false');
        }
    };

    window.closeProfileDropdown = function () {
        const dropdown = document.getElementById('profileDropdown');
        const btn = document.getElementById('profileDropdownBtn');
        if (dropdown) {
            dropdown.classList.add('hidden');
            dropdown.style.display = 'none';
            dropdown.classList.remove('open');
        }
        if (btn) btn.setAttribute('aria-expanded', 'false');
    };

    // =============================================
    // STEP 7C: MOBILE SANDWICH DRAWER CONTROLLER
    // =============================================
    window.toggleMobileSandwichMenu = function (event) {
        if (event) {
            if (typeof event.stopPropagation === 'function') event.stopPropagation();
            if (typeof event.preventDefault === 'function') event.preventDefault();
        }
        const menu = document.getElementById('mobileSandwichMenu');
        const icon = document.getElementById('mobileSandwichIcon');
        const btn = document.getElementById('mobileSandwichBtn');
        if (!menu) return;

        // Mutual exclusion: Close notification dropdown & desktop profile dropdown
        const notifDropdown = document.getElementById('notificationDropdown');
        if (notifDropdown) notifDropdown.style.display = 'none';
        if (window.closeProfileDropdown) window.closeProfileDropdown();

        const isHidden = menu.classList.contains('hidden') || menu.style.display === 'none' || !menu.style.display;
        if (isHidden) {
            menu.classList.remove('hidden');
            menu.style.display = 'flex';
            if (icon) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-times');
            }
            if (btn) btn.setAttribute('aria-expanded', 'true');
            refreshProfileDropdownInfo();
        } else {
            menu.classList.add('hidden');
            menu.style.display = 'none';
            if (icon) {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
            if (btn) btn.setAttribute('aria-expanded', 'false');
        }
    };

    window.closeMobileSandwichMenu = function () {
        const menu = document.getElementById('mobileSandwichMenu');
        const icon = document.getElementById('mobileSandwichIcon');
        const btn = document.getElementById('mobileSandwichBtn');
        if (menu) {
            menu.classList.add('hidden');
            menu.style.display = 'none';
        }
        if (icon) {
            icon.classList.remove('fa-times');
            icon.classList.add('fa-bars');
        }
        if (btn) btn.setAttribute('aria-expanded', 'false');
    };

    // Global click outside listener to close profile dropdown & mobile sandwich drawer
    document.addEventListener('click', function (e) {
        // Profile dropdown
        const dropdown = document.getElementById('profileDropdown');
        if (dropdown && !dropdown.classList.contains('hidden') && dropdown.style.display !== 'none') {
            const wrapper = document.querySelector('.profile-menu-wrapper');
            if (wrapper && !wrapper.contains(e.target)) {
                window.closeProfileDropdown();
            }
        }

        // Mobile sandwich menu
        const mobileMenu = document.getElementById('mobileSandwichMenu');
        const sandwichBtn = document.getElementById('mobileSandwichBtn');
        if (mobileMenu && !mobileMenu.classList.contains('hidden') && mobileMenu.style.display !== 'none') {
            if (!mobileMenu.contains(e.target) && sandwichBtn && !sandwichBtn.contains(e.target)) {
                window.closeMobileSandwichMenu();
            }
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            window.closeProfileDropdown();
            window.closeMobileSandwichMenu();
        }
    });

    // Initial population
    refreshProfileDropdownInfo();

    // =============================================
    // STEP 8: AUTH GUARD
    // =============================================
    const currentPage = window.location.pathname;
    const isProtected = PROTECTED_PAGES.some(p => currentPage.includes(p));

    if (isProtected) {
        const userPhone = getUserPhone();
        if (!userPhone) {
            window.location.href = 'login.html';
        } else {
            if (!sessionStorage.getItem('userPhone')) {
                sessionStorage.setItem('userPhone', userPhone);
                sessionStorage.setItem('userName', getUserName());
            }
            ensureAnonymousAuth();
        }
    }

    // =============================================
    // STEP 9: Auto-redirect if already logged in
    // =============================================
    if (currentPage.includes('login.html') ||
        currentPage.includes('account.html') ||
        currentPage.includes('vet-login.html')) {
        const userPhone = getUserPhone();
        if (userPhone) {
            window.location.href = 'home.html';
        }
    }

    // =============================================
    // STEP 10: Password toggle (with duplicate-guard)
    // =============================================
    document.querySelectorAll('.toggle-password').forEach(btn => {
        if (btn.dataset.dvPasswordBound === '1') return;
        btn.dataset.dvPasswordBound = '1';

        btn.addEventListener('click', function () {
            const targetId = btn.dataset.target;
            if (!targetId) return;
            const input = document.getElementById(targetId);
            if (!input) return;

            const icon = btn.querySelector('i');
            if (input.type === 'password') {
                input.type = 'text';
                if (icon) {
                    icon.classList.remove('fa-eye');
                    icon.classList.add('fa-eye-slash');
                }
            } else {
                input.type = 'password';
                if (icon) {
                    icon.classList.remove('fa-eye-slash');
                    icon.classList.add('fa-eye');
                }
            }
        });
    });

    // =============================================
    // STEP 11: Profile pic preview (register + vet-register)
    // =============================================
    const picWrapper = document.getElementById('profilePicWrapper');
    const picInput = document.getElementById('profilePic');
    const picPreview = document.getElementById('profilePreview');

    if (picWrapper && picInput && picWrapper.dataset.dvPicBound !== '1') {
        picWrapper.dataset.dvPicBound = '1';

        picWrapper.addEventListener('click', () => picInput.click());

        picInput.addEventListener('change', function (e) {
            const file = e.target.files[0];
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                alert('Image too large. Max 5MB.');
                picInput.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = function (ev) {
                if (picPreview) {
                    picPreview.innerHTML = `<img src="${ev.target.result}" alt="Profile"
                        style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
                }
            };
            reader.readAsDataURL(file);
        });
    }

});