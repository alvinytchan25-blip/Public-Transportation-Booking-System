/* Transpo — login page */

(function () {
  'use strict';

  var form = document.getElementById('loginForm');
  var emailInput = document.getElementById('email');
  var passwordInput = document.getElementById('password');
  var emailError = document.getElementById('emailError');
  var passwordError = document.getElementById('passwordError');
  var alertError = document.getElementById('alertError');

  function clearFieldErrors() {
    emailInput.classList.remove('invalid');
    passwordInput.classList.remove('invalid');
    emailError.classList.remove('show');
    passwordError.classList.remove('show');
  }

  function showAlert(message) {
    alertError.textContent = message;
    alertError.classList.add('show');
  }

  function hideAlert() {
    alertError.classList.remove('show');
  }

  emailInput.addEventListener('input', clearFieldErrors);
  passwordInput.addEventListener('input', clearFieldErrors);

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
    clearFieldErrors();
    hideAlert();

    var email = emailInput.value.trim();
    var password = passwordInput.value;

    var hasError = false;
    if (!PTB.isValidEmail(email)) {
      emailInput.classList.add('invalid');
      emailError.classList.add('show');
      hasError = true;
    }
    if (!password) {
      passwordInput.classList.add('invalid');
      passwordError.classList.add('show');
      hasError = true;
    }
    if (hasError) return;

    var user = PTB.findUserByEmail(email);
    if (!user) {
      showAlert('No account found with that email. Please register first.');
      return;
    }
    if (user.password !== password) {
      showAlert('Incorrect password. Please try again.');
      return;
    }

    PTB.setSession(user.id);
    location.href = 'dashboard.html';
  });
})();