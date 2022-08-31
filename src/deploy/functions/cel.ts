import { FirebaseError } from "../../error";
import { assertExhaustive } from "../../functional";
import { ParamValue } from "./params";

export type CelExpression = string;
export type IdentityExpression = CelExpression;
export type EqualityExpression = CelExpression;
export type DualEqualityExpression = CelExpression;
export type TernaryExpression = CelExpression;
export type LiteralTernaryExpression = CelExpression;

export type Literal = string | number | boolean;
type L = "string" | "number" | "boolean";

const identityRegexp = /{{ params\.(\S+) }}/;
const equalityRegexp = /{{ params\.(\S+) == (.+) }}/;
const dualEqualityRegexp = /{{ params\.(\S+) == params\.(\S+) }}/;
const ternaryRegexp = /{{ params\.(\S+) == (.+) \? (.+) : (.+) }/;
const literalTernaryRegexp = /{{ params\.(\S+) \? (.+) : (.+) }/;
const paramRegexp = /params\.(\S+)/;

/**
 *
 */
export function isCelExpression(value: any): value is CelExpression {
  return typeof value === "string" && value.startsWith("{{") && value.endsWith("}}");
}
function isIdentityExpression(value: CelExpression): value is IdentityExpression {
  return identityRegexp.test(value);
}
function isEqualityExpression(value: CelExpression): value is EqualityExpression {
  return equalityRegexp.test(value);
}
function isDualEqualityExpression(value: CelExpression): value is DualEqualityExpression {
  return dualEqualityRegexp.test(value);
}
function isTernaryExpression(value: CelExpression): value is TernaryExpression {
  return ternaryRegexp.test(value);
}
function isLiteralTernaryExpression(value: CelExpression): value is LiteralTernaryExpression {
  return literalTernaryRegexp.test(value);
}

/**
 *
 */
export function resolveExpression(
  wantType: L,
  expr: CelExpression,
  params: Record<string, ParamValue>
): Literal {
  if (isIdentityExpression(expr)) {
    return resolveIdentity(wantType, expr, params);
  } else if (isTernaryExpression(expr)) {
    return resolveTernary(wantType, expr, params);
  } else if (isLiteralTernaryExpression(expr)) {
    return resolveLiteralTernary(wantType, expr, params);
  } else if (isDualEqualityExpression(expr)) {
    return resolveDualEquality(expr, params);
  } else if (isEqualityExpression(expr)) {
    return resolveEquality(expr, params);
  } else {
    throw new FirebaseError("CEL expression '" + expr + "' is of an unsupported form");
  }
}

function assertType(wantType: L, paramName: string, paramValue: ParamValue) {
  if (
    (wantType === "string" && !paramValue.legalString) ||
    (wantType === "number" && !paramValue.legalNumber) ||
    (wantType === "boolean" && !paramValue.legalBoolean)
  ) {
    throw new FirebaseError(`illegal type coercion of param ${paramName} to type ${wantType}`);
  }
}
function readParamValue(wantType: L, paramName: string, paramValue: ParamValue): Literal {
  assertType(wantType, paramName, paramValue);
  if (wantType === "string") {
    return paramValue.asString();
  } else if (wantType === "number") {
    return paramValue.asNumber();
  } else if (wantType === "boolean") {
    return paramValue.asBoolean();
  } else {
    assertExhaustive(wantType);
  }
}

/**
 *  {{ params.foo }}
 */
function resolveIdentity(
  wantType: L,
  expr: IdentityExpression,
  params: Record<string, ParamValue>
): Literal {
  const match = identityRegexp.exec(expr);
  if (!match) {
    throw new FirebaseError("malformed CEL identity expression '" + expr + "'");
  }
  const name = match[1];
  const value = params[name];
  if (!value) {
    throw new FirebaseError("CEL identity expression '" + expr + "' was not resolvable to a param");
  }
  return readParamValue(wantType, name, value);
}

/**
 *  {{ params.foo == 24 }}
 */
function resolveEquality(expr: EqualityExpression, params: Record<string, ParamValue>): boolean {
  const match = equalityRegexp.exec(expr);
  if (!match) {
    throw new FirebaseError("malformed CEL equality expression '" + expr + "'");
  }

  const lhsName = match[1];
  const lhsVal = params[lhsName];
  if (!lhsVal) {
    throw new FirebaseError(
      "CEL equality expression '" + expr + "' references missing param " + lhsName
    );
  }
  let rhs: Literal;
  if (lhsVal.legalString) {
    rhs = resolveLiteral("string", match[2]);
    return lhsVal.asString() === rhs;
  } else if (lhsVal.legalNumber) {
    rhs = resolveLiteral("number", match[2]);
    return lhsVal.asNumber() === rhs;
  } else if (lhsVal.legalBoolean) {
    rhs = resolveLiteral("boolean", match[2]);
    return lhsVal.asBoolean() === rhs;
  } else {
    throw new FirebaseError(`could not infer type of param ${lhsName} used in equality operation`);
  }
}

/**
 *  {{ params.foo == params.bar }}
 */
function resolveDualEquality(
  expr: EqualityExpression,
  params: Record<string, ParamValue>
): boolean {
  const match = dualEqualityRegexp.exec(expr);
  if (!match) {
    throw new FirebaseError("malformed CEL equality expression '" + expr + "'");
  }

  const lhsName = match[1];
  const lhsVal = params[lhsName];
  if (!lhsVal) {
    throw new FirebaseError(
      "CEL equality expression '" + expr + "' references missing param " + lhsName
    );
  }

  const rhsName = match[2];
  const rhsVal = params[rhsName];
  if (!rhsVal) {
    throw new FirebaseError(
      "CEL equality expression '" + expr + "' references missing param " + lhsName
    );
  }

  if (lhsVal.legalString) {
    if (!rhsVal.legalString) {
      throw new FirebaseError(
        `CEL equality expression ${expr} has type mismatch between the operands`
      );
    }
    return lhsVal.asString() == rhsVal.asString();
  } else if (lhsVal.legalNumber) {
    if (!rhsVal.legalNumber) {
      throw new FirebaseError(
        `CEL equality expression ${expr} has type mismatch between the operands`
      );
    }
    return lhsVal.asNumber() == rhsVal.asNumber();
  } else if (lhsVal.legalBoolean) {
    if (!rhsVal.legalBoolean) {
      throw new FirebaseError(
        `CEL equality expression ${expr} has type mismatch between the operands`
      );
    }
    return lhsVal.asBoolean() == rhsVal.asBoolean();
  } else {
    throw new FirebaseError(`could not infer type of param ${lhsName} used in equality operation`);
  }
}

/**
 *  {{ params.foo == 24 ? "asdf" : "jkl;" }}
 */
function resolveTernary(
  wantType: L,
  expr: TernaryExpression,
  params: Record<string, ParamValue>
): Literal {
  const match = ternaryRegexp.exec(expr);
  if (!match) {
    throw new FirebaseError("malformed CEL ternary expression '" + expr + "'");
  }

  // left-hand side of the ternary must be a params.FIELD, supporting any type
  // right-hand side must be a literal, not of type T but of the same type as the LHS
  const equalityExpr = `{{ params.${match[1]} == ${match[2]} }}`;
  const isTrue = resolveEquality(equalityExpr, params);

  if (isTrue) {
    return resolveParamOrLiteral(wantType, match[3], params);
  } else {
    return resolveParamOrLiteral(wantType, match[4], params);
  }
}

/**
 *  {{ params.foo ? "asdf" : "jkl;" }}
 *  only when the paramValue associated with params.foo is validBoolean
 */
function resolveLiteralTernary(
  wantType: L,
  expr: TernaryExpression,
  params: Record<string, ParamValue>
): Literal {
  const match = literalTernaryRegexp.exec(expr);
  if (!match) {
    throw new FirebaseError("malformed CEL ternary expression '" + expr + "'");
  }

  const paramName = match[1];
  const paramValue = params[match[1]];
  if (!paramValue) {
    throw new FirebaseError(
      "CEL ternary expression '" + expr + "' references missing param " + paramName
    );
  }
  if (!paramValue.legalBoolean) {
    throw new FirebaseError(
      "CEL ternary expression '" + expr + "' is conditional on non-boolean param " + paramName
    );
  }

  if (paramValue.asBoolean()) {
    return resolveParamOrLiteral(wantType, match[2], params);
  } else {
    return resolveParamOrLiteral(wantType, match[3], params);
  }
}

function resolveParamOrLiteral(
  wantType: L,
  field: string,
  params: Record<string, ParamValue>
): Literal {
  const match = paramRegexp.exec(field);
  if (!match) {
    return resolveLiteral(wantType, field);
  }
  const paramValue = params[match[1]];
  return readParamValue(wantType, match[1], paramValue);
}

function resolveLiteral(wantType: L, value: string): Literal {
  if (paramRegexp.exec(value)) {
    throw new FirebaseError(
      "CEL tried to evaluate param." + value + " in a context which only permits literal values"
    );
  }

  if (wantType === "number") {
    if (isNaN(+value)) {
      throw new FirebaseError("CEL literal " + value + " does not seem to be a number");
    }
    return +value;
  } else if (wantType === "string") {
    if (!value.startsWith('"') || !value.endsWith('"')) {
      throw new FirebaseError("CEL literal " + value + ' does not seem to be a "-delimited string');
    }
    return value.slice(1, -1);
  } else if (wantType === "boolean") {
    if (value === "true") {
      return true;
    } else if (value === "false") {
      return false;
    } else {
      throw new FirebaseError("CEL literal " + value + "does not seem to be a true/false boolean");
    }
  } else {
    throw new FirebaseError(
      "CEL literal '" + value + "' somehow was resolved with a non-string/number/boolean type"
    );
  }
}