export function splitWalletTaggedDescription(description: string, walletName?: string | null) {
  const rawDescription = (description || "").trim()
  const normalizedWalletName = (walletName || "").trim()

  if (!rawDescription) {
    return {
      title: "",
      walletTag: normalizedWalletName,
    }
  }

  const match = rawDescription.match(/^(.*)\s+\(([^()]+)\)$/)
  if (!match) {
    return {
      title: rawDescription,
      walletTag: normalizedWalletName,
    }
  }

  const title = match[1].trim()
  const trailingTag = match[2].trim()
  if (!title) {
    return {
      title: rawDescription,
      walletTag: normalizedWalletName,
    }
  }

  if (
    normalizedWalletName &&
    trailingTag.toLowerCase() !== normalizedWalletName.toLowerCase()
  ) {
    return {
      title: rawDescription,
      walletTag: normalizedWalletName,
    }
  }

  return {
    title,
    walletTag: trailingTag || normalizedWalletName,
  }
}
