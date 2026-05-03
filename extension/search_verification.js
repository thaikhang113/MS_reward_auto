export function shouldAcceptUnconfirmedSearch(options = {}) {
  const {
    isMobile = false,
    initialCounter = null,
    verification = null
  } = options;

  return Boolean(
    isMobile
    && !initialCounter
    && verification
    && verification.counted === false
    && verification.mode === 'availablePoints'
  );
}
