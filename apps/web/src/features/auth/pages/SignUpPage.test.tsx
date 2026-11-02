import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { ada, problem, renderApp } from '@/test/render-app';

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  api: { get: vi.fn(), post: vi.fn() },
}));

const mockedApi = vi.mocked(api);

beforeEach(() => {
  mockedApi.get.mockRejectedValue(problem(401)); // no session yet
});

async function openSignUp() {
  const app = renderApp('/signup');
  await screen.findByRole('heading', { name: 'Create an account' });
  return app;
}

describe('SignUpPage', () => {
  it('shows a field error once the user leaves an invalid field', async () => {
    const { user } = await openSignUp();

    await user.type(screen.getByLabelText('Name'), 'Al');
    expect(screen.queryByText('Name must be at least 3 characters')).toBeNull(); // not while typing
    await user.tab();

    expect(await screen.findByText('Name must be at least 3 characters')).toBeTruthy();
    expect(screen.getByLabelText('Name').getAttribute('aria-invalid')).toBe('true');
  });

  it('ticks password rules off as they are met', async () => {
    const { user } = await openSignUp();
    const checklist = screen.getByRole('list', { name: 'Password requirements' });

    await user.type(screen.getByLabelText('Password'), 'abc1');

    const items = within(checklist).getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual([
      'At least 8 characters (not met)',
      'One letter (met)',
      'One number (met)',
      'One special character (not met)',
    ]);
  });

  it('shows a taken email under the email field', async () => {
    mockedApi.post.mockRejectedValue(
      problem(409, { errors: [{ path: 'email', message: 'Email is already registered' }] }),
    );
    const { user } = await openSignUp();

    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Name'), 'Ada Lovelace');
    await user.type(screen.getByLabelText('Password'), 'Passw0rd!');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Email is already registered')).toBeTruthy();
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
  });

  it('signs up with normalized input and lands on the welcome page', async () => {
    mockedApi.post.mockResolvedValue(ada);
    const { user } = await openSignUp();

    await user.type(screen.getByLabelText('Email'), '  Ada@Example.com ');
    await user.type(screen.getByLabelText('Name'), 'Ada Lovelace');
    await user.type(screen.getByLabelText('Password'), 'Passw0rd!');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('heading', { name: 'Welcome to the application.' })).toBeTruthy();
    expect(mockedApi.post).toHaveBeenCalledWith('/auth/signup', {
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      password: 'Passw0rd!',
    });
  });
});
