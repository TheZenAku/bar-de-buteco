/** Password rule for NEW passwords (sign-up and reset). Login never uses it, so older accounts keep working. */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

/** First broken rule as a pt-BR message, or '' when the password is acceptable. */
export function passwordProblem(password: string): string {
  if (password.length < PASSWORD_MIN) return `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`;
  if (password.length > PASSWORD_MAX) return `A senha pode ter no máximo ${PASSWORD_MAX} caracteres.`;
  if (!/\p{L}/u.test(password)) return 'A senha precisa ter pelo menos uma letra.';
  if (!/\p{N}/u.test(password)) return 'A senha precisa ter pelo menos um número.';
  if (password.trim() !== password) return 'A senha não pode começar nem terminar com espaço.';
  return '';
}
