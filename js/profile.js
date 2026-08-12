/* Transpo — profile page */

(function () {
  'use strict';

  var user = PTB.getCurrentUser();
  if (!user) return;

  var form = document.getElementById('profileForm');
  var nameInput = document.getElementById('fullName');
  var phoneInput = document.getElementById('phone');
  var addressInput = document.getElementById('address');
  var editInfoBtn = document.getElementById('editInfoBtn');
  var updateInfoBtn = document.getElementById('updateInfoBtn');
  var cancelBtn = document.getElementById('cancelBtn');
  var nameError = document.getElementById('nameError');
  var phoneError = document.getElementById('phoneError');
  var addressError = document.getElementById('addressError');
  var alertSuccess = document.getElementById('alertSuccess');
  var avatar = document.getElementById('profileAvatar');
  var profileName = document.getElementById('profileName');

  var inputs = [nameInput, phoneInput, addressInput];

  function getInitials(name, email) {
    var words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
    }
    var local = String(email || '').split('@')[0].replace(/[^a-z0-9]/gi, '');
    if (local.length >= 2) {
      return (local.charAt(0) + local.charAt(local.length - 1)).toUpperCase();
    }
    return String(name || 'U').charAt(0).toUpperCase();
  }

  function renderAvatar() {
    profileName.textContent = user.fullName;
    avatar.textContent = getInitials(user.fullName, user.email);
  }

  renderAvatar();

  nameInput.value = user.fullName;
  phoneInput.value = user.phone || '';
  addressInput.value = user.address || '';

  function hideAllAlerts() {
    alertSuccess.classList.remove('show');
    inputs.forEach(function (input) {
      input.classList.remove('invalid');
    });
    nameError.classList.remove('show');
    phoneError.classList.remove('show');
    addressError.classList.remove('show');
  }

  function lockForm() {
    inputs.forEach(function (input) {
      input.disabled = true;
    });
    editInfoBtn.classList.remove('hidden');
    updateInfoBtn.classList.add('hidden');
    cancelBtn.classList.add('hidden');
  }

  function unlockForm() {
    inputs.forEach(function (input) {
      input.disabled = false;
    });
    editInfoBtn.classList.add('hidden');
    updateInfoBtn.classList.remove('hidden');
    cancelBtn.classList.remove('hidden');
    nameInput.focus();
  }

  function isValidPhone(value) {
    return /^[0-9+\-\s()]{7,20}$/.test(value);
  }

  editInfoBtn.addEventListener('click', function () {
    hideAllAlerts();
    unlockForm();
  });

  cancelBtn.addEventListener('click', function () {
    nameInput.value = user.fullName;
    phoneInput.value = user.phone || '';
    addressInput.value = user.address || '';
    hideAllAlerts();
    lockForm();
  });

  inputs.forEach(function (input) {
    input.addEventListener('input', hideAllAlerts);
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    hideAllAlerts();

    var name = nameInput.value.trim();
    var phone = phoneInput.value.trim();
    var address = addressInput.value.trim();

    var hasError = false;
    if (!name) {
      nameInput.classList.add('invalid');
      nameError.classList.add('show');
      hasError = true;
    }
    if (!isValidPhone(phone)) {
      phoneInput.classList.add('invalid');
      phoneError.classList.add('show');
      hasError = true;
    }
    if (!address) {
      addressInput.classList.add('invalid');
      addressError.classList.add('show');
      hasError = true;
    }
    if (hasError) return;

    user.fullName = name;
    user.phone = phone;
    user.address = address;
    PTB.updateUser(user);

    alertSuccess.textContent = 'Profile updated successfully.';
    alertSuccess.classList.add('show');
    renderAvatar();
    lockForm();
  });

  document.getElementById('logoutBtn').addEventListener('click', function () {
    PTB.clearSession();
    location.href = 'login.html';
  });
})();
