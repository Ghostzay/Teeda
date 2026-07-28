/**
 * Turns Postgres/PostgREST plumbing errors into something a person can act on.
 * The common case by far is "the migrations were never applied".
 */
export function describeSetupError(error: { message?: string; code?: string }): string {
  const message = error.message ?? "";
  const missingSchema =
    error.code === "PGRST202" ||
    error.code === "42P01" ||
    error.code === "42883" ||
    /could not find the function/i.test(message) ||
    /(relation|function).*does not exist/i.test(message) ||
    /schema cache/i.test(message);

  if (missingSchema) {
    return (
      "The database isn't set up yet. Run the SQL in supabase/migrations/ against your " +
      "project (Supabase → SQL Editor, or `supabase db push`), then try again."
    );
  }

  return message || "Could not create the salon.";
}
