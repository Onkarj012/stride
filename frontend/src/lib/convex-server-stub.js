// Browser-compatible stub for convex/server.
// anyApi is just a recursive Proxy that creates function references like api.meals.getMeals
// The Convex React client only needs the string path, not actual server code.
const makeProxy = () =>
  new Proxy(
    {},
    {
      get(_, prop) {
        if (typeof prop !== "string") return undefined;
        return makeProxy();
      },
    }
  );

export const anyApi = makeProxy();
export const componentsGeneric = () => ({});

// Stub out everything else convex/server exports so imports don't break
export const defineSchema = () => ({});
export const defineTable = () => ({});
export const v = new Proxy({}, { get: () => () => ({}) });
