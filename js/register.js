/* Transpo — register page */

(function () {
  'use strict';

  var form = document.getElementById('registerForm');
  var nameInput = document.getElementById('fullName');
  var emailInput = document.getElementById('email');
  var passwordInput = document.getElementById('password');
  var nameError = document.getElementById('fullNameError');
  var emailError = document.getElementById('emailError');
  var passwordError = document.getElementById('passwordError');
  var alertError = document.getElementById('alertError');

  var fields = [
    { input: nameInput, error: nameError },
    { input: emailInput, error: emailError },
    { input: passwordInput, error: passwordError }
  ];

  function clearAllErrors() {
    fields.forEach(function (f) {
      f.input.classList.remove('invalid');
      f.error.classList.remove('show');
    });
    alertError.classList.remove('show');
  }

  function markInvalid(input, errorEl, showError) {
    input.classList.add('invalid');
    if (showError) errorEl.classList.add('show');
  }

  fields.forEach(function (f) {
    f.input.addEventListener('input', clearAllErrors);
  });

  document.querySelectorAll('.toggle-pw').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = document.getElementById(btn.getAttribute('data-toggle-for'));
      var reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      btn.textContent = reveal ? 'Hide' : 'Show';
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearAllErrors();

    var name = nameInput.value.trim();
    var email = emailInput.value.trim();
    var password = passwordInput.value;

    var hasError = false;

    if (!name) {
      markInvalid(nameInput, nameError, true);
      hasError = true;
    }
    if (!PTB.isValidEmail(email)) {
      markInvalid(emailInput, emailError, true);
      hasError = true;
    }
    if (password.length < 6) {
      markInvalid(passwordInput, passwordError, true);
      hasError = true;
    }
    if (hasError) return;

    if (PTB.isEmailTaken(email)) {
      markInvalid(emailInput, emailError, false);
      alertError.textContent = 'This email is already registered. Please log in or use a different email.';
      alertError.classList.add('show');
      return;
    }

    var user = {
      id: PTB.uid('usr'),
      fullName: name,
      email: PTB.normalizeEmail(email),
      password: password
    };

    PTB.saveUser(user);
    PTB.setSession(user.id);
    location.href = 'dashboard.html';
  });
})();