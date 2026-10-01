// Typed equivalents of Convex-generated bindings, usable before provisioning/codegen.
import {
  mutationGeneric,
  queryGeneric,
  internalMutationGeneric,
  type DataModelFromSchemaDefinition,
  type MutationBuilder,
  type QueryBuilder,
  type GenericMutationCtx,
  type GenericQueryCtx,
} from "convex/server";
import schema from "./schema";
export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
export type MutationCtx = GenericMutationCtx<DataModel>;
export type QueryCtx = GenericQueryCtx<DataModel>;
export const mutation: MutationBuilder<DataModel, "public"> = mutationGeneric;
export const internalMutation: MutationBuilder<DataModel, "internal"> =
  internalMutationGeneric;
export const query: QueryBuilder<DataModel, "public"> = queryGeneric;
