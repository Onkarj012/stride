// Browser-compatible stub for convex/server.
// Replicates anyApi using the same Symbol.for("functionName") the Convex React
// client uses internally to resolve api.module.function → "module:function".
const functionName = Symbol.for("functionName");

function createApi(pathParts = []) {
  return new Proxy(
    {},
    {
      get(_, prop) {
        if (typeof prop === "string") {
          return createApi([...pathParts, prop]);
        } else if (prop === functionName) {
          if (pathParts.length < 2) return undefined;
          const path = pathParts.slice(0, -1).join("/");
          const exportName = pathParts[pathParts.length - 1];
          return exportName === "default" ? path : `${path}:${exportName}`;
        } else if (prop === Symbol.toStringTag) {
          return "FunctionReference";
        }
        return undefined;
      },
    }
  );
}

export const anyApi = createApi();
export const componentsGeneric = () => ({});
