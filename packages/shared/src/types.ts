// Response shapes shared by the API and the web app.

export type User = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

// RFC 9457 problem details, plus field errors for forms.
export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  errors?: { path: string; message: string }[];
};
