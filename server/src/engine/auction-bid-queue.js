export function createAuctionBidQueue() {
  const queueTails = new Map()

  function enqueue(auctionId, operation) {
    // Each auction owns a queue tail, so unrelated auctions never block each other.
    const previous = queueTails.get(auctionId) ?? Promise.resolve()
    // Chaining prevents same-auction requests from racing authoritative state.
    const result = previous.then(operation)
    const tail = result
      .catch(() => {})
      .finally(() => {
        if (queueTails.get(auctionId) === tail) {
          queueTails.delete(auctionId)
        }
      })

    queueTails.set(auctionId, tail)
    return result
  }

  return { enqueue }
}
