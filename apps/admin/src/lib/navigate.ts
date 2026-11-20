/**
 * Leaves the admin for another address (the payment gateway's page that saves a card). A function
 * of its own so a test can stand in for the browser's navigation.
 */
export function navigateTo(url: string): void {
  window.location.assign(url);
}
