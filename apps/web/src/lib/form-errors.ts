import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api';

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
