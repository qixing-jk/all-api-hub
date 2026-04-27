export const getNumericChannelType = (type: unknown) =>
  typeof type === "number" ? type : undefined
