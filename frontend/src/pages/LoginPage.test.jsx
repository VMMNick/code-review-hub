import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import LoginPage from './LoginPage.jsx';

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  it('renders email and password fields plus a submit button', () => {
    renderLoginPage();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/пароль/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /увійти/i })).toBeInTheDocument();
  });

  it('lets the user type into both fields', async () => {
    const user = userEvent.setup();
    renderLoginPage();
    const email = screen.getByLabelText(/email/i);
    const password = screen.getByLabelText(/пароль/i);

    await user.type(email, 'a@example.com');
    await user.type(password, 'secret123');

    expect(email).toHaveValue('a@example.com');
    expect(password).toHaveValue('secret123');
  });

  it('requires both fields before submitting', () => {
    renderLoginPage();
    expect(screen.getByLabelText(/email/i)).toBeRequired();
    expect(screen.getByLabelText(/пароль/i)).toBeRequired();
  });
});
