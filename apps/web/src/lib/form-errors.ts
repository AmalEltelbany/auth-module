import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api';

/**
 * The API's one answer for a wrong, expired or used OTP (and, at reset, an
 * unknown email: the same 400 by design). It belongs under the OTP boxes.
 */
export const isOtpRejected = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.status === 400 && error.fieldErrors.length === 0;

/**
 * Puts server errors where the user will look: field errors (e.g. a 409 on
 * `email`) under their input, everything else above the submit button.
 */
export function applyServerErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>) {
  if (error instanceof ApiError && error.fieldErrors.length > 0) {
    for (const { path, message } of error.fieldErrors) {
      setError(path as Path<T>, { message }, { shouldFocus: true });
    }
    return;
  }
  setError('root.server', {
    message: error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
  });
}
