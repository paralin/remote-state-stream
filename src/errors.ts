export const WindowErrors = {
  OutOfRange: () => {
    return new Error('Window is out of range.');
  },
  GenericFailure: () => {
    return new Error('Window failed with unknown error.');
  },
};
