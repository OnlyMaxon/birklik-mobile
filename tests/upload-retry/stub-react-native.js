let current = 'active'
const listeners = new Set()
exports.AppState = {
  get currentState() { return current },
  addEventListener(_event, cb) {
    listeners.add(cb)
    return {remove: () => listeners.delete(cb)}
  },
}
exports.__setState = state => {
  current = state
  for (const cb of [...listeners]) cb(state)
}
exports.__listenerCount = () => listeners.size
