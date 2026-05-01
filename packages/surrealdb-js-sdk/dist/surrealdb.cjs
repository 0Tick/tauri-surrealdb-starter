Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
//#region src/internal/normalize-path.ts
function normalizePath(prefix, path) {
	return `/${[...prefix.split("/"), ...path.split("/")].filter(Boolean).join("/")}`;
}
//#endregion
//#region src/errors.ts
var SurrealError = class extends Error {};
/**
* Thrown when a call has been terminated because the connection was closed
*/
var CallTerminatedError = class extends SurrealError {
	name = "CallTerminatedError";
	message = "The call has been terminated because the connection was closed";
};
/**
* Thrown when reconnect attempts have been exhausted
*/
var ReconnectExhaustionError = class extends SurrealError {
	name = "ReconnectExhaustionError";
	message = "The reconnect attempts have been exhausted";
};
/**
* Thrown when a reconnect iterator fails to iterate
*/
var ReconnectIterationError = class extends SurrealError {
	name = "ReconnectIterationError";
	message = "The reconnect iterator failed to iterate";
};
/**
* Thrown when an unexpected server response is received
*/
var UnexpectedServerResponseError = class extends SurrealError {
	name = "UnexpectedServerResponseError";
	response;
	constructor(response) {
		super(`The server returned an unexpected response: ${JSON.stringify(response)}`);
		this.response = response;
	}
};
/**
* Thrown when an unexpected connection error occurs
*/
var UnexpectedConnectionError = class extends SurrealError {
	name = "UnexpectedConnectionError";
	message = "An unexpected connection error occurred";
	constructor(cause) {
		super();
		this.cause = cause;
	}
};
/**
* Thrown when an engine is not supported
*/
var UnsupportedEngineError = class extends SurrealError {
	name = "UnsupportedEngineError";
	engine;
	constructor(engine) {
		super(`The engine "${engine}" is not supported or configured`);
		this.engine = engine;
	}
};
/**
* Thrown when there is no connection available
*/
var ConnectionUnavailableError = class extends SurrealError {
	name = "ConnectionUnavailableError";
	message = "You must be connected to a SurrealDB instance before performing this operation";
};
/**
* Thrown when there is no namespace and/or database selected
*/
var MissingNamespaceDatabaseError = class extends SurrealError {
	name = "MissingNamespaceDatabaseError";
	message = "There is no namespace and/or database selected";
};
/**
* Thrown when a connection to the server fails
*/
var HttpConnectionError = class extends SurrealError {
	name = "HttpConnectionError";
	status;
	statusText;
	buffer;
	constructor(message, status, statusText, buffer) {
		super(`HTTP connection failed: ${message}`);
		this.status = status;
		this.statusText = statusText;
		this.buffer = buffer;
	}
};
/**
* Known error kinds returned by the SurrealDB server.
* Use these constants for matching against `ServerError.kind`.
*/
const ErrorKind = {
	Validation: "Validation",
	Configuration: "Configuration",
	Thrown: "Thrown",
	Query: "Query",
	Serialization: "Serialization",
	NotAllowed: "NotAllowed",
	NotFound: "NotFound",
	AlreadyExists: "AlreadyExists",
	Connection: "Connection",
	Internal: "Internal"
};
/**
* Base class for all errors originating from the SurrealDB server.
* Replaces the former `ResponseError` class.
*
* Server errors carry structured information:
* - `kind` — the error category (e.g. `"NotAllowed"`, `"NotFound"`)
* - `code` — legacy JSON-RPC numeric error code (0 when unavailable)
* - `details` — kind-specific structured details from the server (`{ kind, details? }` format)
* - `cause` — optional inner `ServerError` forming a recursive error chain
*
* The `cause` field mirrors Rust's `Option<Box<Error>>` — each error can
* optionally wrap an inner error, creating a stack of structured errors.
* It is set as the native `Error.cause` so that standard JS tooling
* (Node.js, Chrome DevTools, debuggers) displays the full chain
* automatically using the `[cause]:` format.
*
* Use `instanceof` on subclasses (e.g. `NotFoundError`, `NotAllowedError`)
* for type-safe matching, or check the `kind` property directly.
*/
var ServerError = class extends SurrealError {
	get name() {
		return `ServerError [${this.kind}]`;
	}
	/** The structured error kind (e.g. "NotAllowed", "NotFound", "Internal") */
	kind;
	/** Legacy JSON-RPC error code. 0 when not available (e.g. query result errors). */
	code;
	/**
	* Kind-specific structured details using the `{ kind, details? }` wire format.
	* `undefined` when not provided by the server. Subclasses narrow this type
	* to their specific detail union (e.g. `NotAllowedErrorDetail`).
	*/
	details;
	constructor(options) {
		const innerCause = options.cause ?? void 0;
		super(options.message, innerCause ? { cause: innerCause } : void 0);
		this.kind = options.kind;
		this.code = options.code ?? 0;
		this.details = options.details ?? void 0;
	}
};
/**
* Server error: validation failure (parse error, invalid request/params, bad input).
*/
var ValidationError = class extends ServerError {
	kind = "Validation";
	get name() {
		return "ValidationError";
	}
	/** True if this is a SurrealQL parse error. */
	get isParseError() {
		return this.details?.kind === "Parse";
	}
	/** The name of the invalid parameter, if applicable. */
	get parameterName() {
		if (this.details?.kind !== "InvalidParameter") return void 0;
		return this.details.details?.name;
	}
};
/**
* Server error: feature or configuration not supported (live queries, GraphQL).
*/
var ConfigurationError = class extends ServerError {
	kind = "Configuration";
	get name() {
		return "ConfigurationError";
	}
	/** True if live queries are not supported by the server configuration. */
	get isLiveQueryNotSupported() {
		return this.details?.kind === "LiveQueryNotSupported";
	}
};
/**
* Server error: user-thrown error via THROW in SurrealQL.
*/
var ThrownError = class extends ServerError {
	kind = "Thrown";
	get name() {
		return "ThrownError";
	}
};
/**
* Server error: query execution failure (timeout, cancelled, not executed).
*/
var QueryError = class extends ServerError {
	kind = "Query";
	get name() {
		return "QueryError";
	}
	/** True if the query was not executed (e.g. due to a prior error in the batch). */
	get isNotExecuted() {
		return this.details?.kind === "NotExecuted";
	}
	/** True if the query timed out. */
	get isTimedOut() {
		return this.details?.kind === "TimedOut";
	}
	/** True if the query was cancelled. */
	get isCancelled() {
		return this.details?.kind === "Cancelled";
	}
	/** The timeout duration, if this is a timeout error. Returns `{ secs, nanos }` or undefined. */
	get timeout() {
		if (this.details?.kind !== "TimedOut") return void 0;
		return this.details.details?.duration;
	}
};
/**
* Server error: serialization or deserialization failure.
*/
var SerializationError = class extends ServerError {
	kind = "Serialization";
	get name() {
		return "SerializationError";
	}
	/** True if this is a deserialization error (as opposed to serialization). */
	get isDeserialization() {
		return this.details?.kind === "Deserialization";
	}
};
/**
* Server error: permission denied, method not allowed, function/scripting blocked.
*/
var NotAllowedError = class extends ServerError {
	kind = "NotAllowed";
	get name() {
		return "NotAllowedError";
	}
	/** True if the auth token has expired. */
	get isTokenExpired() {
		return this.details?.kind === "Auth" && this.details.details?.kind === "TokenExpired";
	}
	/** True if authentication credentials are invalid. */
	get isInvalidAuth() {
		return this.details?.kind === "Auth" && this.details.details?.kind === "InvalidAuth";
	}
	/** True if scripting is blocked. */
	get isScriptingBlocked() {
		return this.details?.kind === "Scripting";
	}
	/** The method name that is not allowed, if applicable. */
	get methodName() {
		if (this.details?.kind !== "Method") return void 0;
		return this.details.details?.name;
	}
	/** The function name that is not allowed, if applicable. */
	get functionName() {
		if (this.details?.kind !== "Function") return void 0;
		return this.details.details?.name;
	}
};
/**
* Server error: resource not found (table, record, namespace, method, etc.).
*/
var NotFoundError = class extends ServerError {
	kind = "NotFound";
	get name() {
		return "NotFoundError";
	}
	/** The table name that was not found, if applicable. */
	get tableName() {
		if (this.details?.kind !== "Table") return void 0;
		return this.details.details?.name;
	}
	/** The record ID that was not found, if applicable. */
	get recordId() {
		if (this.details?.kind !== "Record") return void 0;
		return this.details.details?.id;
	}
	/** The RPC method name that was not found, if applicable. */
	get methodName() {
		if (this.details?.kind !== "Method") return void 0;
		return this.details.details?.name;
	}
	/** The namespace name that was not found, if applicable. */
	get namespaceName() {
		if (this.details?.kind !== "Namespace") return void 0;
		return this.details.details?.name;
	}
	/** The database name that was not found, if applicable. */
	get databaseName() {
		if (this.details?.kind !== "Database") return void 0;
		return this.details.details?.name;
	}
};
/**
* Server error: duplicate resource (record, table, namespace, etc.).
*/
var AlreadyExistsError = class extends ServerError {
	kind = "AlreadyExists";
	get name() {
		return "AlreadyExistsError";
	}
	/** The record ID that already exists, if applicable. */
	get recordId() {
		if (this.details?.kind !== "Record") return void 0;
		return this.details.details?.id;
	}
	/** The table name that already exists, if applicable. */
	get tableName() {
		if (this.details?.kind !== "Table") return void 0;
		return this.details.details?.name;
	}
};
/**
* Server error: unexpected or unknown internal error.
* Also used as the fallback for unrecognized `kind` strings from newer servers.
*/
var InternalError = class extends ServerError {
	kind = "Internal";
	get name() {
		return "InternalError";
	}
};
/**
* @deprecated Use `ServerError` instead. This alias exists for backward compatibility.
*/
const ResponseError = ServerError;
/**
* Thrown when authentication fails
*/
var AuthenticationError = class extends SurrealError {
	name = "AuthenticationError";
	message = "Authentication did not succeed";
	constructor(cause) {
		super();
		this.cause = cause;
	}
};
/**
* Thrown when a live subscription fails to listen
*/
var LiveSubscriptionError = class extends SurrealError {
	name = "LiveSubscriptionError";
	constructor(messageOrCause) {
		if (typeof messageOrCause === "string") super(messageOrCause);
		else {
			super("Live subscription failed to listen");
			this.cause = messageOrCause;
		}
	}
};
/**
* Thrown when the version of the remote datastore is not supported
*/
var UnsupportedVersionError = class extends SurrealError {
	name = "UnsupportedVersionError";
	version;
	minimum;
	maximum;
	constructor(version, minimum, maximum) {
		super(`The version "${version}" reported by the engine is not supported by this library, expected a version that satisfies >= ${minimum} < ${maximum}`);
		this.version = version;
		this.minimum = minimum;
		this.maximum = maximum;
	}
};
/**
* Thrown when a SurrealQL expression fails to compute
*/
var ExpressionError = class extends SurrealError {
	name = "ExpressionError";
	constructor(messageOrCause) {
		if (typeof messageOrCause === "string") super(messageOrCause);
		else {
			super("Failed to parse invalid expression");
			this.cause = messageOrCause;
		}
	}
};
/**
* Thrown when one or more subscribers throw an error
*/
var PublishError = class PublishError extends SurrealError {
	name = "PublishError";
	message = "One or more subscribers threw an error:";
	causes;
	constructor(causes) {
		super();
		this.causes = causes;
		this.message += PublishError.#appendCauses(causes, "");
	}
	static #appendCauses(causes, msg) {
		let message = msg;
		for (const cause of causes) if (cause instanceof PublishError) message = PublishError.#appendCauses(cause.causes, msg);
		else message += `\n  - ${cause instanceof Error ? cause.message : cause}`;
		return message;
	}
};
/**
* Thrown when a parsed date or datetime is invalid
*/
var InvalidDateError = class extends SurrealError {
	name = "InvalidDateError";
	constructor(dateOrMessage) {
		if (typeof dateOrMessage === "string") super(dateOrMessage);
		else super(`The provided date is invalid: ${dateOrMessage}`);
	}
};
/**
* Thrown when a feature is not supported by the current engine
*/
var UnsupportedFeatureError = class extends SurrealError {
	name = "UnsupportedFeatureError";
	feature;
	constructor(feature) {
		super(`The configured engine does not support the feature: ${feature.name}`);
		this.feature = feature;
	}
};
/**
* Thrown when a feature is not available in the used version of SurrealDB
*/
var UnavailableFeatureError = class extends SurrealError {
	name = "UnavailableFeatureError";
	feature;
	version;
	constructor(feature, version) {
		super(`The version of SurrealDB (${version}) does not support the feature: ${feature.name} (>= ${feature.sinceVersion} < ${feature.untilVersion})`);
		this.feature = feature;
		this.version = version;
	}
};
/**
* Thrown when a session is invalid
*/
var InvalidSessionError = class extends SurrealError {
	name = "InvalidSessionError";
	message = "The provided session is invalid";
	session;
	constructor(session) {
		super(`Invalid session: ${session}`);
		this.session = session;
	}
};
/**
* Thrown when an API request was unsuccessful
*/
var UnsuccessfulApiError = class extends SurrealError {
	name = "UnsuccessfulApiError";
	path;
	method;
	response;
	constructor(path, method, response) {
		super(`The ${method.toUpperCase()} ${path} request failed with status ${response.status}`);
		this.path = path;
		this.method = method;
		this.response = response;
	}
};
/**
* Thrown when a RecordId or RecordIdRange is constructed with invalid parts
*/
var InvalidRecordIdError = class extends SurrealError {
	name = "InvalidRecordIdError";
};
/**
* Thrown when a Duration string cannot be parsed or a duration operation is invalid
*/
var InvalidDurationError = class extends SurrealError {
	name = "InvalidDurationError";
};
/**
* Thrown when a Decimal operation fails (division by zero, invalid input, etc.)
*/
var InvalidDecimalError = class extends SurrealError {
	name = "InvalidDecimalError";
};
/**
* Thrown when a Table or StringRecordId is constructed with an invalid value
*/
var InvalidTableError = class extends SurrealError {
	name = "InvalidTableError";
};
//#endregion
//#region src/internal/dispatched-promise.ts
var DispatchedPromise = class extends Promise {
	#resolve;
	#reject;
	#dispatched = false;
	constructor() {
		let _resolve;
		let _reject;
		super((resolve, reject) => {
			_resolve = resolve;
			_reject = reject;
		});
		if (!_resolve || !_reject) throw new Error("resolve and reject required");
		this.#resolve = _resolve;
		this.#reject = _reject;
	}
	#ensureDispatched() {
		if (!this.#dispatched) {
			this.#dispatched = true;
			this.dispatch().then(this.#resolve, this.#reject);
		}
		return this;
	}
	then(onfulfilled, onrejected) {
		this.#ensureDispatched();
		return super.then(onfulfilled, onrejected);
	}
	catch(onrejected) {
		this.#ensureDispatched();
		return super.catch(onrejected);
	}
	finally(onfinally) {
		this.#ensureDispatched();
		return super.finally(onfinally);
	}
	static get [Symbol.species]() {
		return Promise;
	}
	get [Symbol.toStringTag]() {
		return "DispatchedPromise";
	}
};
//#endregion
//#region src/internal/get-incremental-id.ts
let id = 0;
function getIncrementalID() {
	id = (id + 1) % Number.MAX_SAFE_INTEGER;
	return id.toString();
}
//#endregion
//#region src/utils/range.ts
/**
* Represents a range bound which includes the value within the range
*/
var BoundIncluded = class {
	constructor(value) {
		this.value = value;
	}
};
/**
* Represents a range bound which excludes the value from the range
*/
var BoundExcluded = class {
	constructor(value) {
		this.value = value;
	}
};
//#endregion
//#region src/internal/escape-regex.ts
function escapeRegex(str) {
	return str.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}
//#endregion
//#region src/value/value.ts
/**
* A complex SurrealQL value type
*/
var Value = class {};
//#endregion
//#region src/value/duration.ts
const NANOSECOND = 1n;
const MICROSECOND$1 = 1000n * NANOSECOND;
const MILLISECOND$1 = 1000n * MICROSECOND$1;
const SECOND$1 = 1000n * MILLISECOND$1;
const MINUTE = 60n * SECOND$1;
const HOUR = 60n * MINUTE;
const DAY = 24n * HOUR;
const WEEK = 7n * DAY;
const YEAR = 365n * DAY;
const UNITS = new Map([
	["ns", NANOSECOND],
	["µs", MICROSECOND$1],
	["μs", MICROSECOND$1],
	["us", MICROSECOND$1],
	["ms", MILLISECOND$1],
	["s", SECOND$1],
	["m", MINUTE],
	["h", HOUR],
	["d", DAY],
	["w", WEEK],
	["y", YEAR]
]);
const UNITS_REVERSED = Array.from(UNITS).reduce((map, [unit, size]) => {
	map.set(size, unit);
	return map;
}, /* @__PURE__ */ new Map());
const DURATION_PART_REGEX = new RegExp(`^(\\d+)\\.?\\d*(${Array.from(UNITS.keys()).map(escapeRegex).join("|")})`);
const FLOAT_DURATION_REGEX = new RegExp(`^(\\d+(?:\\.\\d+)?)(${Array.from(UNITS.keys()).map(escapeRegex).join("|")})$`);
/**
* A SurrealQL duration value with support for parsing, formatting, arithmetic, and nanosecond precision.
*/
var Duration = class Duration extends Value {
	#seconds;
	#nanoseconds;
	constructor(input) {
		super();
		if (input instanceof Duration) {
			this.#seconds = input.#seconds;
			this.#nanoseconds = input.#nanoseconds;
		} else if (typeof input === "string") {
			const [s, ns] = Duration.parseString(input);
			this.#seconds = s;
			this.#nanoseconds = ns;
		} else {
			const s = typeof input[0] === "bigint" ? input[0] : BigInt(Math.floor(input[0] ?? 0));
			const ns = typeof input[1] === "bigint" ? input[1] : BigInt(Math.floor(input[1] ?? 0));
			const total = s * SECOND$1 + ns;
			this.#seconds = total / SECOND$1;
			this.#nanoseconds = total % SECOND$1;
		}
	}
	equals(other) {
		if (!(other instanceof Duration)) return false;
		return this.#seconds === other.#seconds && this.#nanoseconds === other.#nanoseconds;
	}
	toJSON() {
		return this.toString();
	}
	/**
	* @returns Human readable duration string
	*/
	toString() {
		let remainingSeconds = this.#seconds;
		let result = "";
		for (const [size, unit] of Array.from(UNITS_REVERSED).reverse()) if (size >= SECOND$1) {
			const amount = remainingSeconds / (size / SECOND$1);
			if (amount > 0n) {
				remainingSeconds %= size / SECOND$1;
				result += `${amount}${unit}`;
			}
		}
		let remainingNanoseconds = remainingSeconds * SECOND$1 + this.#nanoseconds;
		for (const [size, unit] of Array.from(UNITS_REVERSED).reverse()) if (size < SECOND$1) {
			const amount = remainingNanoseconds / size;
			if (amount > 0n) {
				remainingNanoseconds %= size;
				result += `${amount}${unit}`;
			}
		}
		return result;
	}
	/**
	* Converts the duration to a tuple
	*/
	toCompact() {
		return this.#nanoseconds > 0n ? [this.#seconds, this.#nanoseconds] : this.#seconds > 0n ? [this.#seconds] : [];
	}
	/**
	* Parses a duration string like "1h30m"
	*
	* @param input Input string
	* @returns [seconds, nanoseconds]
	*/
	static parseString(input) {
		let seconds = 0n;
		let nanoseconds = 0n;
		let left = input;
		while (left !== "") {
			const match = left.match(DURATION_PART_REGEX);
			if (match) {
				const amount = BigInt(match[1]);
				const unit = match[2];
				const factor = UNITS.get(unit);
				if (!factor) throw new InvalidDurationError(`Invalid duration unit: ${unit}`);
				if (factor >= SECOND$1) seconds += amount * (factor / SECOND$1);
				else nanoseconds += amount * factor;
				left = left.slice(match[0].length);
			} else throw new InvalidDurationError("Could not match a next duration part");
		}
		seconds += nanoseconds / SECOND$1;
		nanoseconds %= SECOND$1;
		return [seconds, nanoseconds];
	}
	/**
	* Adds two durations together
	*
	* @param other The duration to add
	* @returns The resulting duration
	*/
	add(other) {
		let sec = this.#seconds + other.#seconds;
		let ns = this.#nanoseconds + other.#nanoseconds;
		if (ns >= SECOND$1) {
			sec += 1n;
			ns -= SECOND$1;
		}
		return new Duration([sec, ns]);
	}
	/**
	* Subtracts another duration from this one
	*
	* @param other The duration to subtract
	* @returns The resulting duration
	*/
	sub(other) {
		let sec = this.#seconds - other.#seconds;
		let ns = this.#nanoseconds - other.#nanoseconds;
		if (ns < 0n) {
			sec -= 1n;
			ns += SECOND$1;
		}
		return new Duration([sec, ns]);
	}
	/**
	* Multiplies the duration by a scalar
	*
	* @param factor The factor to multiply by
	* @returns The resulting duration
	*/
	mul(factor) {
		const factorBig = typeof factor === "bigint" ? factor : BigInt(Math.floor(factor));
		const resultNs = (this.#seconds * SECOND$1 + this.#nanoseconds) * factorBig;
		return new Duration([resultNs / SECOND$1, resultNs % SECOND$1]);
	}
	div(divisor) {
		if (typeof divisor === "object" && divisor instanceof Duration) {
			const a = this.#seconds * SECOND$1 + this.#nanoseconds;
			const b = divisor.#seconds * SECOND$1 + divisor.#nanoseconds;
			if (b === 0n) throw new InvalidDurationError("Division by zero duration");
			return a / b;
		}
		const divisorBig = typeof divisor === "bigint" ? divisor : BigInt(Math.floor(divisor));
		if (divisorBig === 0n) throw new InvalidDurationError("Division by zero");
		const resultNs = (this.#seconds * SECOND$1 + this.#nanoseconds) / divisorBig;
		return new Duration([resultNs / SECOND$1, resultNs % SECOND$1]);
	}
	/**
	* Computes the remainder after division
	*
	* @param mod The divisor
	* @returns The remainder duration
	*/
	mod(mod) {
		const a = this.#seconds * SECOND$1 + this.#nanoseconds;
		const b = mod.#seconds * SECOND$1 + mod.#nanoseconds;
		if (b === 0n) throw new InvalidDurationError("Modulo by zero duration");
		const resultNs = a % b;
		return new Duration([resultNs / SECOND$1, resultNs % SECOND$1]);
	}
	/**
	* Total nanoseconds in this duration
	*/
	get nanoseconds() {
		return this.#seconds * SECOND$1 + this.#nanoseconds;
	}
	/**
	* Total microseconds
	*/
	get microseconds() {
		return this.nanoseconds / MICROSECOND$1;
	}
	/**
	* Total milliseconds
	*/
	get milliseconds() {
		return this.nanoseconds / MILLISECOND$1;
	}
	/**
	* Whole seconds in the duration
	*/
	get seconds() {
		return this.#seconds;
	}
	/**
	* Total whole minutes in the duration
	*/
	get minutes() {
		return this.#seconds / (MINUTE / SECOND$1);
	}
	/**
	* Total whole hours in the duration
	*/
	get hours() {
		return this.#seconds / (HOUR / SECOND$1);
	}
	/**
	* Total whole days in the duration
	*/
	get days() {
		return this.#seconds / (DAY / SECOND$1);
	}
	/**
	* Total whole weeks in the duration
	*/
	get weeks() {
		return this.#seconds / (WEEK / SECOND$1);
	}
	/**
	* Total whole years in the duration
	*/
	get years() {
		return this.#seconds / (YEAR / SECOND$1);
	}
	/**
	* Creates a Duration from nanoseconds
	*
	* @param ns Nanoseconds value
	* @returns The resulting duration
	*/
	static nanoseconds(ns) {
		const n = typeof ns === "bigint" ? ns : BigInt(Math.floor(ns));
		return new Duration([n / SECOND$1, n % SECOND$1]);
	}
	/**
	* Creates a Duration from microseconds
	*
	* @param µs Microseconds value
	* @returns The resulting duration
	*/
	static microseconds(µs) {
		const n = typeof µs === "bigint" ? µs : BigInt(Math.floor(µs));
		return Duration.nanoseconds(n * MICROSECOND$1);
	}
	/**
	* Creates a Duration from milliseconds
	*
	* @param ms Milliseconds value
	* @returns The resulting duration
	*/
	static milliseconds(ms) {
		const n = typeof ms === "bigint" ? ms : BigInt(Math.floor(ms));
		return Duration.nanoseconds(n * MILLISECOND$1);
	}
	/**
	* Creates a Duration from seconds
	*
	* @param s Seconds value
	* @returns The resulting duration
	*/
	static seconds(s) {
		return new Duration([typeof s === "bigint" ? s : BigInt(Math.floor(s)), 0n]);
	}
	/**
	* Creates a Duration from minutes
	*
	* @param m Minutes value
	* @returns The resulting duration
	*/
	static minutes(m) {
		return new Duration([(typeof m === "bigint" ? m : BigInt(Math.floor(m))) * (MINUTE / SECOND$1), 0n]);
	}
	/**
	* Creates a Duration from hours
	*
	* @param h Hours value
	* @returns The resulting duration
	*/
	static hours(h) {
		return new Duration([(typeof h === "bigint" ? h : BigInt(Math.floor(h))) * (HOUR / SECOND$1), 0n]);
	}
	/**
	* Creates a Duration from days
	*
	* @param d Days value
	* @returns The resulting duration
	*/
	static days(d) {
		return new Duration([(typeof d === "bigint" ? d : BigInt(Math.floor(d))) * (DAY / SECOND$1), 0n]);
	}
	/**
	* Creates a Duration from weeks
	*
	* @param w Weeks value
	* @returns The resulting duration
	*/
	static weeks(w) {
		return new Duration([(typeof w === "bigint" ? w : BigInt(Math.floor(w))) * (WEEK / SECOND$1), 0n]);
	}
	/**
	* Creates a Duration from years
	*
	* @param y Years value
	* @returns The resulting duration
	*/
	static years(y) {
		return new Duration([(typeof y === "bigint" ? y : BigInt(Math.floor(y))) * (YEAR / SECOND$1), 0n]);
	}
	/**
	* Parses a duration from a float string with a single time unit, e.g. "1.998487792s", "1.5m", "500.0ms"
	*
	* @param input Float duration string
	* @returns The resulting duration
	*/
	static parseFloat(input) {
		const match = input.match(FLOAT_DURATION_REGEX);
		if (!match) throw new InvalidDurationError(`Invalid float duration string: ${input}`);
		const numStr = match[1];
		const unit = match[2];
		const factor = UNITS.get(unit);
		if (!factor) throw new InvalidDurationError(`Invalid duration unit: ${unit}`);
		const [intPart, fracPart = ""] = numStr.split(".");
		const scale = 10n ** BigInt(fracPart.length);
		const totalNs = (BigInt(intPart) * scale + BigInt(fracPart || "0")) * factor / scale;
		return new Duration([totalNs / SECOND$1, totalNs % SECOND$1]);
	}
	/**
	* Measures the elapsed time since the function was called
	* If the Performance API is available, it uses it to measure the elapsed time in nanoseconds
	*
	* @returns A function that returns the elapsed time as a Duration
	*/
	static measure() {
		if (typeof performance !== "undefined" && performance.now) {
			const start = performance.now();
			return () => {
				const end = performance.now();
				return Duration.nanoseconds((end - start) * 1e6);
			};
		}
		const start = Date.now();
		return () => {
			const end = Date.now();
			return Duration.milliseconds(end - start);
		};
	}
};
//#endregion
//#region src/value/datetime.ts
const MICROSECOND = 1000n * 1n;
const MILLISECOND = 1000n * MICROSECOND;
const SECOND = 1000n * MILLISECOND;
/**
* A SurrealQL datetime value with support for parsing, formatting, arithmetic, and nanosecond precision.
*/
var DateTime = class DateTime extends Value {
	#seconds;
	#nanoseconds;
	static loadHr = typeof process !== "undefined" && process.hrtime ? {
		ns: process.hrtime.bigint(),
		ms: BigInt(Date.now())
	} : void 0;
	constructor(input) {
		super();
		if (input === void 0) {
			const now = DateTime.now();
			this.#seconds = now.#seconds;
			this.#nanoseconds = now.#nanoseconds;
		} else if (input instanceof DateTime) {
			this.#seconds = input.#seconds;
			this.#nanoseconds = input.#nanoseconds;
		} else if (input instanceof Date) {
			const time = input.getTime();
			if (Number.isNaN(time)) throw new InvalidDateError(input);
			const s = BigInt(Math.floor(time / 1e3));
			const ns = BigInt(time % 1e3 * 1e6);
			this.#seconds = s;
			this.#nanoseconds = ns;
		} else if (typeof input === "string") {
			const [s, ns] = DateTime.parseString(input);
			this.#seconds = s;
			this.#nanoseconds = ns;
		} else if (typeof input === "number") {
			this.#seconds = BigInt(Math.floor(input));
			this.#nanoseconds = 0n;
		} else if (typeof input === "bigint") {
			this.#seconds = input;
			this.#nanoseconds = 0n;
		} else {
			const s = typeof input[0] === "bigint" ? input[0] : BigInt(Math.floor(input[0] ?? 0));
			const ns = typeof input[1] === "bigint" ? input[1] : BigInt(Math.floor(input[1] ?? 0));
			const totalSeconds = s + ns / SECOND;
			this.#seconds = totalSeconds;
			this.#nanoseconds = ns % SECOND;
		}
	}
	equals(other) {
		if (!(other instanceof DateTime)) return false;
		return this.#seconds === other.#seconds && this.#nanoseconds === other.#nanoseconds;
	}
	toJSON() {
		return this.toISOString();
	}
	/**
	* @returns The ISO 8601 string representation of the datetime
	*/
	toString() {
		return this.toISOString();
	}
	/**
	* Converts the datetime to a tuple
	*/
	toCompact() {
		return [this.#seconds, this.#nanoseconds];
	}
	/**
	* Formats the datetime as an ISO 8601 string
	*/
	toISOString() {
		const totalMilliseconds = Number(this.#seconds) * 1e3 + Number(this.#nanoseconds) / 1e6;
		const isoString = new Date(totalMilliseconds).toISOString();
		if (this.#nanoseconds === 0n) return isoString;
		const trimmed = this.#nanoseconds.toString().padStart(9, "0").replace(/0+$/, "");
		return isoString.replace(/\.\d{3}Z$/, `.${trimmed}Z`);
	}
	/**
	* Converts to JavaScript Date object
	*/
	toDate() {
		const milliseconds = Number(this.#seconds) * 1e3 + Math.floor(Number(this.#nanoseconds) / 1e6);
		return new Date(milliseconds);
	}
	/**
	* Parses a datetime string
	*
	* @param input Input string (ISO 8601 format)
	* @returns [seconds, nanoseconds] tuple
	*/
	static parseString(input) {
		const match = input.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z?$/);
		if (match) {
			const [, year, month, day, hour, minute, second, fraction] = match;
			const baseIsoString = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
			const baseDate = new Date(baseIsoString);
			const baseTimestamp = baseDate.getTime();
			if (Number.isNaN(baseTimestamp)) throw new InvalidDateError(baseDate);
			const seconds = BigInt(Math.floor(baseTimestamp / 1e3));
			let nanoseconds = 0n;
			if (fraction) {
				const fractionLength = fraction.length;
				if (fractionLength <= 3) nanoseconds = BigInt(fraction.padEnd(3, "0")) * 1000000n;
				else if (fractionLength <= 6) nanoseconds = BigInt(fraction.padEnd(6, "0")) * 1000n;
				else nanoseconds = BigInt(fraction.padEnd(9, "0"));
			}
			return [seconds, nanoseconds];
		}
		const timestamp = Date.parse(input);
		if (!Number.isNaN(timestamp)) return [BigInt(Math.floor(timestamp / 1e3)), BigInt(timestamp % 1e3 * 1e6)];
		throw new InvalidDateError(`Invalid datetime format: ${input}`);
	}
	/**
	* Adds a duration to this datetime
	*
	* @param duration The duration to add
	* @returns The new datetime instance
	*/
	add(duration) {
		const [durSeconds, durNanoseconds] = duration.toCompact();
		let newSeconds = this.#seconds + (durSeconds || 0n);
		let newNanoseconds = this.#nanoseconds + (durNanoseconds || 0n);
		if (newNanoseconds >= SECOND) {
			newSeconds += 1n;
			newNanoseconds -= SECOND;
		}
		return new DateTime([newSeconds, newNanoseconds]);
	}
	/**
	* Subtracts a duration from this datetime
	*
	* @param duration The duration to subtract
	* @returns The new datetime instance
	*/
	sub(duration) {
		const [durSeconds, durNanoseconds] = duration.toCompact();
		let newSeconds = this.#seconds - (durSeconds || 0n);
		let newNanoseconds = this.#nanoseconds - (durNanoseconds || 0n);
		if (newNanoseconds < 0n) {
			newSeconds -= 1n;
			newNanoseconds += SECOND;
		}
		return new DateTime([newSeconds, newNanoseconds]);
	}
	/**
	* Calculates the duration between two datetimes
	*
	* @param other The other datetime
	*/
	diff(other) {
		const totalThis = this.#seconds * SECOND + this.#nanoseconds;
		const totalOther = other.#seconds * SECOND + other.#nanoseconds;
		const diff = totalThis > totalOther ? totalThis - totalOther : totalOther - totalThis;
		return Duration.nanoseconds(diff);
	}
	/**
	* Compares this DateTime with another
	*
	* @param other The DateTime to compare with
	* @returns -1 if other is before, 0 if equal, 1 if other is after
	*/
	compare(other) {
		const a = this.nanoseconds;
		const b = other.nanoseconds;
		if (a < b) return -1;
		if (a > b) return 1;
		return 0;
	}
	/**
	* Total nanoseconds since Unix epoch
	*/
	get nanoseconds() {
		return this.#seconds * SECOND + this.#nanoseconds;
	}
	/**
	* Total microseconds since Unix epoch
	*/
	get microseconds() {
		return this.nanoseconds / MICROSECOND;
	}
	/**
	* Total milliseconds since Unix epoch
	*/
	get milliseconds() {
		return Number(this.nanoseconds / MILLISECOND);
	}
	/**
	* Seconds since Unix epoch
	*/
	get seconds() {
		return Number(this.#seconds);
	}
	/**
	* Creates a DateTime from nanoseconds since Unix epoch
	*
	* @param ns Nanoseconds value
	*/
	static fromEpochNanoseconds(ns) {
		const n = typeof ns === "bigint" ? ns : BigInt(Math.floor(ns));
		return new DateTime([n / SECOND, n % SECOND]);
	}
	/**
	* Creates a DateTime from microseconds since Unix epoch
	*
	* @param µs Microseconds value
	*/
	static fromEpochMicroseconds(µs) {
		const n = typeof µs === "bigint" ? µs : BigInt(Math.floor(µs));
		return DateTime.fromEpochNanoseconds(n * MICROSECOND);
	}
	/**
	* Creates a DateTime from milliseconds since Unix epoch
	*
	* @param ms Milliseconds value
	*/
	static fromEpochMilliseconds(ms) {
		const n = typeof ms === "bigint" ? ms : BigInt(Math.floor(ms));
		return DateTime.fromEpochNanoseconds(n * MILLISECOND);
	}
	/**
	* Creates a DateTime from seconds since Unix epoch
	*
	* @param s Seconds value
	*/
	static fromEpochSeconds(s) {
		return new DateTime([typeof s === "bigint" ? s : BigInt(Math.floor(s)), 0n]);
	}
	/**
	* Returns a new DateTime representing the current time
	*/
	static now() {
		if (DateTime.loadHr) {
			const diffNs = process.hrtime.bigint() - DateTime.loadHr.ns;
			const totalNanoseconds = DateTime.loadHr.ms * 1000000n + diffNs;
			return new DateTime([totalNanoseconds / 1000000000n, totalNanoseconds % 1000000000n]);
		}
		if (typeof performance !== "undefined" && performance.now && performance.timeOrigin) {
			const totalMilliseconds = performance.timeOrigin + performance.now();
			return new DateTime([BigInt(Math.floor(totalMilliseconds / 1e3)), BigInt(Math.floor(totalMilliseconds % 1e3 * 1e6))]);
		}
		const now = Date.now();
		return new DateTime([BigInt(Math.floor(now / 1e3)), BigInt(now % 1e3 * 1e6)]);
	}
	/**
	* Returns a new DateTime representing the Unix epoch (1970-01-01T00:00:00Z)
	*/
	static epoch() {
		return new DateTime([0n, 0n]);
	}
};
//#endregion
//#region src/value/decimal.ts
/**
* A SurrealQL decimal number value with support for parsing, formatting, arithmetic, and high precision.
*/
var Decimal = class Decimal extends Value {
	#int;
	#frac;
	#scale;
	constructor(input) {
		super();
		if (input instanceof Decimal) {
			this.#int = input.#int;
			this.#frac = input.#frac;
			this.#scale = input.#scale;
		} else if (typeof input === "bigint") {
			this.#int = input;
			this.#frac = 0n;
			this.#scale = 0;
		} else if (Array.isArray(input)) {
			let [int, frac, scale] = input;
			const maxFrac = 10n ** BigInt(scale);
			if (frac >= maxFrac) {
				int += frac / maxFrac;
				frac %= maxFrac;
			}
			this.#int = int;
			this.#frac = frac;
			this.#scale = scale;
		} else if (typeof input === "string" && /e/i.test(input)) {
			const dec = Decimal.fromScientificNotation(input);
			this.#int = dec.#int;
			this.#frac = dec.#frac;
			this.#scale = dec.#scale;
		} else {
			const str = input.toString().trim();
			const isNegative = str.startsWith("-");
			const [intStrRaw, fracStrRaw = ""] = (isNegative ? str.slice(1) : str).split(".");
			const safeInt = /^\d+$/.test(intStrRaw) ? intStrRaw : "0";
			const safeFrac = /^\d+$/.test(fracStrRaw) ? fracStrRaw : "0";
			const intStr = safeInt || "0";
			const fracStr = safeFrac.padEnd(safeFrac.length || 1, "0");
			const absInt = BigInt(intStr);
			const absFrac = BigInt(fracStr);
			this.#int = isNegative ? -absInt : absInt;
			this.#frac = isNegative ? -absFrac : absFrac;
			this.#scale = safeFrac.length;
		}
	}
	equals(other) {
		if (!(other instanceof Decimal)) return false;
		const a = this.toBigIntWithScale();
		const b = other.toBigIntWithScale();
		const scale = Math.max(a.scale, b.scale);
		return a.value * 10n ** BigInt(scale - a.scale) === b.value * 10n ** BigInt(scale - b.scale);
	}
	toJSON() {
		return this.toString();
	}
	/**
	* @returns The canonical string representation of the decimal with
	* trailing zeros in fractional part trimmed
	*/
	toString() {
		const sign = this.#int < 0n || this.#frac < 0n ? "-" : "";
		const absInt = this.#int < 0n ? -this.#int : this.#int;
		const absFrac = this.#frac < 0n ? -this.#frac : this.#frac;
		if (this.#scale === 0) return `${sign}${absInt}`;
		let fracStr = absFrac.toString().padStart(this.#scale, "0");
		let end = fracStr.length;
		while (end > 0 && fracStr.charCodeAt(end - 1) === 48) end--;
		fracStr = fracStr.slice(0, end);
		return fracStr === "" ? `${sign}${absInt}` : `${sign}${absInt}.${fracStr}`;
	}
	/** Returns the integer part of the number */
	get int() {
		return this.#int;
	}
	/** Returns the fractional part of the number */
	get frac() {
		return this.#frac;
	}
	/** Returns the scale (number of decimal places) */
	get scale() {
		return this.#scale;
	}
	/**
	* Adds another Decimal to this one
	*
	* @param other The Decimal to add
	* @returns A new Decimal representing the sum
	*/
	add(other) {
		const a = this.toBigIntWithScale();
		const b = other.toBigIntWithScale();
		const scale = Math.max(a.scale, b.scale);
		const scaleDiffA = BigInt(scale - a.scale);
		const scaleDiffB = BigInt(scale - b.scale);
		const sum = a.value * 10n ** scaleDiffA + b.value * 10n ** scaleDiffB;
		return new Decimal([
			sum / 10n ** BigInt(scale),
			sum % 10n ** BigInt(scale),
			scale
		]);
	}
	/**
	* Subtracts another Decimal from this one
	*
	* @param other The Decimal to subtract
	* @returns A new Decimal representing the difference
	*/
	sub(other) {
		const a = this.toBigIntWithScale();
		const b = other.toBigIntWithScale();
		const scale = Math.max(a.scale, b.scale);
		const factorA = 10n ** BigInt(scale - a.scale);
		const factorB = 10n ** BigInt(scale - b.scale);
		const result = a.value * factorA - b.value * factorB;
		return new Decimal([
			result / 10n ** BigInt(scale),
			result % 10n ** BigInt(scale),
			scale
		]);
	}
	/**
	* Multiplies this Decimal by another
	*
	* @param other The Decimal to multiply by
	* @returns A new Decimal representing the product
	*/
	mul(other) {
		const a = this.toBigIntWithScale();
		const b = other.toBigIntWithScale();
		const result = a.value * b.value;
		const scale = a.scale + b.scale;
		return new Decimal([
			result / 10n ** BigInt(scale),
			result % 10n ** BigInt(scale),
			scale
		]);
	}
	/**
	* Divides this Decimal by another, with fixed precision
	*
	* @param other The Decimal to divide by
	* @returns A new Decimal representing the quotient
	*/
	div(other) {
		const a = this.toBigIntWithScale();
		const b = other.toBigIntWithScale();
		if (b.value === 0n) throw new InvalidDecimalError("Division by zero");
		const targetScale = 38;
		const scaleDiff = BigInt(targetScale + b.scale - a.scale);
		const result = a.value * 10n ** scaleDiff / b.value;
		return new Decimal([
			result / 10n ** BigInt(targetScale),
			result % 10n ** BigInt(targetScale),
			targetScale
		]);
	}
	/**
	* Computes the remainder of this Decimal divided by another
	*
	* @param other The divisor Decimal
	* @returns A new Decimal representing the remainder
	*/
	mod(other) {
		const a = this.toBigIntWithScale();
		const b = other.toBigIntWithScale();
		if (b.value === 0n) throw new InvalidDecimalError("Modulo by zero");
		const scale = Math.max(a.scale, b.scale);
		const scaleDiffA = BigInt(scale - a.scale);
		const scaleDiffB = BigInt(scale - b.scale);
		const result = a.value * 10n ** scaleDiffA % (b.value * 10n ** scaleDiffB);
		return new Decimal([
			result / 10n ** BigInt(scale),
			result % 10n ** BigInt(scale),
			scale
		]);
	}
	/**
	* Returns the absolute value of this Decimal
	* @returns A new Decimal with non-negative components
	*/
	abs() {
		return this.#int < 0n || this.#frac < 0n ? new Decimal([
			this.#int < 0n ? -this.#int : this.#int,
			this.#frac < 0n ? -this.#frac : this.#frac,
			this.#scale
		]) : this;
	}
	/**
	* Returns the negated value of this Decimal
	* @returns A new Decimal with inverted sign
	*/
	neg() {
		return new Decimal([
			-this.#int,
			-this.#frac,
			this.#scale
		]);
	}
	/**
	* Checks if the value is exactly zero
	* @returns True if both int and frac parts are zero
	*/
	isZero() {
		return this.#int === 0n && this.#frac === 0n;
	}
	/**
	* Checks if the value is negative
	* @returns True if negative
	*/
	isNegative() {
		return this.#int < 0n || this.#int === 0n && this.#frac < 0n;
	}
	/**
	* Compares this Decimal with another
	*
	* @param other The Decimal to compare with
	* @returns -1 if less, 0 if equal, 1 if greater
	*/
	compare(other) {
		const a = this.toBigIntWithScale();
		const b = other.toBigIntWithScale();
		const scale = Math.max(a.scale, b.scale);
		const aVal = a.value * 10n ** BigInt(scale - a.scale);
		const bVal = b.value * 10n ** BigInt(scale - b.scale);
		if (aVal < bVal) return -1;
		if (aVal > bVal) return 1;
		return 0;
	}
	/**
	* Rounds the Decimal to a fixed number of decimal places
	*
	* @param precision Number of digits to keep after the decimal point
	* @returns The new decimal instance
	*/
	round(precision) {
		if (precision < 0) throw new InvalidDecimalError("Precision must be >= 0");
		const full = this.toBigIntWithScale();
		if (this.#scale <= precision) {
			const factor = 10n ** BigInt(precision - this.#scale);
			const newValue = full.value * factor;
			return new Decimal([
				newValue / 10n ** BigInt(precision),
				newValue % 10n ** BigInt(precision),
				precision
			]);
		}
		const factor = 10n ** BigInt(this.#scale - precision);
		const half = factor / 2n;
		const rounded = full.value >= 0n ? (full.value + half) / factor : (full.value - half) / factor;
		return new Decimal([
			rounded / 10n ** BigInt(precision),
			rounded % 10n ** BigInt(precision),
			precision
		]);
	}
	/**
	* Converts the number to fixed-point notation string
	*
	* @param precision Number of digits after the decimal point
	*/
	toFixed(precision) {
		const rounded = this.round(precision);
		const sign = rounded.int < 0n || rounded.frac < 0n ? "-" : "";
		const absInt = rounded.int < 0n ? -rounded.int : rounded.int;
		if (precision === 0) return `${sign}${absInt}`;
		return `${sign}${absInt}.${(rounded.frac < 0n ? -rounded.frac : rounded.frac).toString().padStart(precision, "0")}`;
	}
	/**
	* Converts the Decimal to a native JavaScript number
	* @returns A number approximation (may lose precision)
	*/
	toFloat() {
		return Number(this.toString());
	}
	/**
	* Converts to bigint by truncating the fractional part
	* @returns An bigint approximation (may lose precision)
	*/
	toBigInt() {
		if (this.#int >= 0n) return this.#int;
		if (this.#frac !== 0n) return this.#int - 1n;
		return this.#int;
	}
	/**
	* Returns the raw parts of the Decimal
	* @returns An object with int, frac, and scale
	*/
	toParts() {
		return {
			int: this.#int,
			frac: this.#frac,
			scale: this.#scale
		};
	}
	/**
	* Converts to scientific notation string (e.g., "1.23e4")
	*/
	toScientific() {
		if (this.isZero()) return "0e0";
		const negative = this.isNegative();
		const [intPart, fracPart = ""] = (negative ? this.neg() : this).toString().split(".");
		const raw = (intPart + fracPart).replace(/^0+/, "");
		if (raw.search(/[1-9]/) === -1) return "0e0";
		let exponent;
		if (intPart !== "0") exponent = intPart.length - 1;
		else {
			let leading = 0;
			while (leading < fracPart.length && fracPart.charCodeAt(leading) === 48) leading++;
			exponent = -leading - 1;
		}
		let end = raw.length;
		while (end > 0 && raw.charCodeAt(end - 1) === 48) end--;
		const digits = raw.slice(0, end);
		const mantissa = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits[0];
		return `${negative ? "-" : ""}${mantissa}e${exponent}`;
	}
	/**
	* Parses a number in scientific notation into a Decimal
	*
	* @param input The scientific notation string
	*/
	static fromScientificNotation(input) {
		const trimmed = input.trim();
		if (!/^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/.test(trimmed)) throw new InvalidDecimalError(`Invalid scientific notation: ${input}`);
		const [baseStr, expStr] = trimmed.split(/[eE]/);
		const exp = Number.parseInt(expStr, 10);
		const negative = baseStr.startsWith("-");
		const [intPart, fracPart = ""] = baseStr.replace(/^[-+]/, "").split(".");
		const raw = intPart + fracPart;
		let start = 0;
		while (start < raw.length && raw.charCodeAt(start) === 48) start++;
		const digits = raw.slice(start) || "0";
		const newPointIndex = intPart.length + exp;
		let result;
		if (newPointIndex <= 0) result = `0.${"0".repeat(-newPointIndex)}${digits}`;
		else if (newPointIndex >= digits.length) result = digits + "0".repeat(newPointIndex - digits.length);
		else result = `${digits.slice(0, newPointIndex)}.${digits.slice(newPointIndex)}`;
		return new Decimal(negative ? `-${result}` : result);
	}
	toBigIntWithScale() {
		return {
			value: this.#int * 10n ** BigInt(this.#scale) + this.#frac,
			scale: this.#scale
		};
	}
};
//#endregion
//#region src/value/file.ts
/**
* A SurrealQL file reference value.
*/
var FileRef = class FileRef extends Value {
	#bucket;
	#key;
	constructor(bucket, key) {
		super();
		this.#bucket = bucket;
		this.#key = key.startsWith("/") ? key : `/${key}`;
	}
	get bucket() {
		return this.#bucket;
	}
	get key() {
		return this.#key;
	}
	equals(other) {
		if (!(other instanceof FileRef)) return false;
		return this.#bucket === other.#bucket && this.#key === other.#key;
	}
	toJSON() {
		return this.toString();
	}
	toString() {
		return `${fmtInner(this.#bucket, true)}:${fmtInner(this.#key, false)}`;
	}
};
function fmtInner(str, escapeSlash) {
	let result = "";
	for (let i = 0; i < str.length; i++) {
		const char = str[i];
		const code = str.charCodeAt(i);
		if (code >= 48 && code <= 57 || code >= 65 && code <= 90 || code >= 97 && code <= 122 || code === 95 || code === 45 || code === 46 || !escapeSlash && code === 47) result += char;
		else result += `\\${char}`;
	}
	return result;
}
//#endregion
//#region src/value/future.ts
/**
* An uncomputed SurrealQL future value.
*
* @deprecated Futures were removed in SurrealDB 3.0
*/
var Future = class Future extends Value {
	#body;
	constructor(body) {
		super();
		this.#body = body;
	}
	equals(other) {
		if (!(other instanceof Future)) return false;
		return this.#body === other.#body;
	}
	toJSON() {
		return this.toString();
	}
	/**
	* @returns The uncomputed future notation
	*/
	toString() {
		return `<future> ${this.#body}`;
	}
	/**
	* The body of the future
	*/
	get body() {
		return this.#body;
	}
};
//#endregion
//#region src/value/geometry.ts
/**
* A SurrealQL geometry value.
*/
var Geometry = class Geometry extends Value {
	equals(other) {
		if (!(other instanceof Geometry)) return false;
		return this.is(other);
	}
	toString() {
		return JSON.stringify(this.toJSON());
	}
};
function f(num) {
	if (num instanceof Decimal) return num.toFloat();
	return num;
}
/**
* A SurrealQL point geometry value.
*/
var GeometryPoint = class GeometryPoint extends Geometry {
	point;
	constructor(point) {
		super();
		if (point instanceof GeometryPoint) this.point = point.clone().point;
		else this.point = [f(point[0]), f(point[1])];
	}
	toJSON() {
		return {
			type: "Point",
			coordinates: this.coordinates
		};
	}
	get coordinates() {
		return this.point;
	}
	is(geometry) {
		if (!(geometry instanceof GeometryPoint)) return false;
		return this.point[0] === geometry.point[0] && this.point[1] === geometry.point[1];
	}
	clone() {
		return new GeometryPoint([...this.point]);
	}
};
/**
* A SurrealQL line geometry value.
*/
var GeometryLine = class GeometryLine extends Geometry {
	line;
	constructor(line) {
		super();
		this.line = line instanceof GeometryLine ? line.clone().line : line;
	}
	toJSON() {
		return {
			type: "LineString",
			coordinates: this.coordinates
		};
	}
	get coordinates() {
		return this.line.map((g) => g.coordinates);
	}
	close() {
		if (!this.line[0].is(this.line.at(-1))) this.line.push(this.line[0]);
	}
	is(geometry) {
		if (!(geometry instanceof GeometryLine)) return false;
		if (this.line.length !== geometry.line.length) return false;
		for (let i = 0; i < this.line.length; i++) if (!this.line[i].is(geometry.line[i])) return false;
		return true;
	}
	clone() {
		return new GeometryLine(this.line.map((p) => p.clone()));
	}
};
/**
* A SurrealQL polygon geometry value.
*/
var GeometryPolygon = class GeometryPolygon extends Geometry {
	polygon;
	constructor(polygon) {
		super();
		this.polygon = polygon instanceof GeometryPolygon ? polygon.clone().polygon : polygon.map((l) => {
			const line = l.clone();
			line.close();
			return line;
		});
	}
	toJSON() {
		return {
			type: "Polygon",
			coordinates: this.coordinates
		};
	}
	get coordinates() {
		return this.polygon.map((g) => g.coordinates);
	}
	is(geometry) {
		if (!(geometry instanceof GeometryPolygon)) return false;
		if (this.polygon.length !== geometry.polygon.length) return false;
		for (let i = 0; i < this.polygon.length; i++) if (!this.polygon[i].is(geometry.polygon[i])) return false;
		return true;
	}
	clone() {
		return new GeometryPolygon(this.polygon.map((p) => p.clone()));
	}
};
/**
* A SurrealQL multi-point geometry value.
*/
var GeometryMultiPoint = class GeometryMultiPoint extends Geometry {
	points;
	constructor(points) {
		super();
		this.points = points instanceof GeometryMultiPoint ? points.points : points;
	}
	toJSON() {
		return {
			type: "MultiPoint",
			coordinates: this.coordinates
		};
	}
	get coordinates() {
		return this.points.map((g) => g.coordinates);
	}
	is(geometry) {
		if (!(geometry instanceof GeometryMultiPoint)) return false;
		if (this.points.length !== geometry.points.length) return false;
		for (let i = 0; i < this.points.length; i++) if (!this.points[i].is(geometry.points[i])) return false;
		return true;
	}
	clone() {
		return new GeometryMultiPoint(this.points.map((p) => p.clone()));
	}
};
/**
* A SurrealQL multi-line geometry value.
*/
var GeometryMultiLine = class GeometryMultiLine extends Geometry {
	lines;
	constructor(lines) {
		super();
		this.lines = lines instanceof GeometryMultiLine ? lines.lines : lines;
	}
	toJSON() {
		return {
			type: "MultiLineString",
			coordinates: this.coordinates
		};
	}
	get coordinates() {
		return this.lines.map((g) => g.coordinates);
	}
	is(geometry) {
		if (!(geometry instanceof GeometryMultiLine)) return false;
		if (this.lines.length !== geometry.lines.length) return false;
		for (let i = 0; i < this.lines.length; i++) if (!this.lines[i].is(geometry.lines[i])) return false;
		return true;
	}
	clone() {
		return new GeometryMultiLine(this.lines.map((p) => p.clone()));
	}
};
/**
* A SurrealQL multi-polygon geometry value.
*/
var GeometryMultiPolygon = class GeometryMultiPolygon extends Geometry {
	polygons;
	constructor(polygons) {
		super();
		this.polygons = polygons instanceof GeometryMultiPolygon ? polygons.polygons : polygons;
	}
	toJSON() {
		return {
			type: "MultiPolygon",
			coordinates: this.coordinates
		};
	}
	get coordinates() {
		return this.polygons.map((g) => g.coordinates);
	}
	is(geometry) {
		if (!(geometry instanceof GeometryMultiPolygon)) return false;
		if (this.polygons.length !== geometry.polygons.length) return false;
		for (let i = 0; i < this.polygons.length; i++) if (!this.polygons[i].is(geometry.polygons[i])) return false;
		return true;
	}
	clone() {
		return new GeometryMultiPolygon(this.polygons.map((p) => p.clone()));
	}
};
/**
* A SurrealQL geometry collection value.
*/
var GeometryCollection = class GeometryCollection extends Geometry {
	collection;
	constructor(collection) {
		super();
		this.collection = collection instanceof GeometryCollection ? collection.collection : collection;
	}
	toJSON() {
		return {
			type: "GeometryCollection",
			geometries: this.geometries
		};
	}
	get geometries() {
		return this.collection.map((g) => g.toJSON());
	}
	is(geometry) {
		if (!(geometry instanceof GeometryCollection)) return false;
		if (this.collection.length !== geometry.collection.length) return false;
		for (let i = 0; i < this.collection.length; i++) if (!this.collection[i].is(geometry.collection[i])) return false;
		return true;
	}
	clone() {
		return new GeometryCollection(this.collection.map((p) => p.clone()));
	}
};
//#endregion
//#region src/internal/range.ts
function getRangeJoin(beg, end) {
	let output = "";
	if (beg instanceof BoundExcluded) output += ">";
	output += "..";
	if (end instanceof BoundIncluded) output += "=";
	return output;
}
//#endregion
//#region src/utils/equals.ts
/**
* Recursively compare supported SurrealQL values for equality.
*
* @param x The first value to compare
* @param y The second value to compare
* @returns Whether the two values are recursively equal
*/
function equals(x, y) {
	if (typeof x === "bigint" && typeof y === "number") return x <= Number.MAX_SAFE_INTEGER ? Number(x) === y : x === BigInt(y);
	if (typeof x === "number" && typeof y === "bigint") return y <= Number.MAX_SAFE_INTEGER ? x === Number(y) : BigInt(x) === y;
	if (Object.is(x, y)) return true;
	if (x instanceof Date && y instanceof Date) return x.getTime() === y.getTime();
	if (x instanceof RegExp && y instanceof RegExp) return x.toString() === y.toString();
	if (x instanceof Value && y instanceof Value) return x.equals(y);
	if (typeof x !== "object" || x === null || typeof y !== "object" || y === null) return false;
	const keysX = Reflect.ownKeys(x);
	const keysY = Reflect.ownKeys(y);
	if (keysX.length !== keysY.length) return false;
	for (let i = 0; i < keysX.length; i++) {
		if (!Reflect.has(y, keysX[i])) return false;
		if (!equals(x[keysX[i]], y[keysX[i]])) return false;
	}
	return true;
}
//#endregion
//#region src/utils/to-surql-string.ts
/**
* Recursively convert any supported SurrealQL value into a string representation.
*
* @param input The input value
* @returns Stringified SurrealQL representation
*/
function toSurqlString(input) {
	if (typeof input === "string") return `s${JSON.stringify(input)}`;
	if (input === null) return "NULL";
	if (input === void 0) return "NONE";
	if (typeof input === "object") {
		if (input instanceof Uuid) return `u${JSON.stringify(input.toString())}`;
		if (input instanceof Date || input instanceof DateTime) return `d${JSON.stringify(input.toISOString())}`;
		if (input instanceof _RecordId || input instanceof StringRecordId) return `r${JSON.stringify(input.toString())}`;
		if (input instanceof FileRef) return `f${JSON.stringify(input.toString())}`;
		if (input instanceof Geometry) return toSurqlString(input.toJSON());
		if (input instanceof Decimal) return `${input.toJSON()}dec`;
		if (input instanceof Duration || input instanceof Future || input instanceof Range || input instanceof Table) return input.toJSON();
		switch (Object.getPrototypeOf(input)) {
			case Object.prototype: {
				let output = "{ ";
				const entries = Object.entries(input);
				for (const [i, [k, v]] of entries.entries()) {
					output += `${JSON.stringify(k)}: ${toSurqlString(v)}`;
					if (i < entries.length - 1) output += ", ";
				}
				output += " }";
				return output;
			}
			case Map.prototype: {
				let output = "{ ";
				const entries = Array.from(input.entries());
				for (const [i, [k, v]] of entries.entries()) {
					output += `${JSON.stringify(k)}: ${toSurqlString(v)}`;
					if (i < entries.length - 1) output += ", ";
				}
				output += " }";
				return output;
			}
			case Array.prototype: return `[ ${input.map(toSurqlString).join(", ")} ]`;
			case Set.prototype: return `[ ${[...input].map(toSurqlString).join(", ")} ]`;
		}
	}
	return `${input}`;
}
//#endregion
//#region src/utils/escape.ts
const MAX_i64 = 9223372036854775807n;
function isOnlyNumbers(str) {
	return /^[\d_]+$/.test(str);
}
/**
* Escape a given string to be used as a valid SurrealQL ident
*
* @param str - The string to escape
* @returns Optionally escaped string
*/
function escapeIdent(str) {
	if (isOnlyNumbers(str)) return `⟨${str}⟩`;
	if (str === "") return "⟨⟩";
	let code;
	let i;
	let len;
	for (i = 0, len = str.length; i < len; i++) {
		code = str.charCodeAt(i);
		if (!(code > 47 && code < 58) && !(code > 64 && code < 91) && !(code > 96 && code < 123) && !(code === 95)) return `⟨${str.replaceAll("⟩", "\\⟩")}⟩`;
	}
	return str;
}
/**
* Escape a number to be used as a valid SurrealQL ident
*
* @param num - The number to escape
* @returns Optionally escaped number
*/
function escapeNumber(num) {
	return num <= MAX_i64 ? num.toString() : `⟨${num}⟩`;
}
/**
* Escape a record id value part
*
* @param id The record id value part
* @returns The escaped record id value part
*/
function escapeIdPart(id) {
	return id instanceof Uuid ? `u"${id}"` : typeof id === "string" ? escapeIdent(id) : typeof id === "bigint" || typeof id === "number" ? escapeNumber(id) : toSurqlString(id);
}
/**
* Escape a range bound value
*
* @param bound The range bound containing a value
* @returns The escaped range bound
*/
function escapeRangeBound(bound) {
	if (bound === void 0) return "";
	const value = bound.value;
	if (isValidIdPart(value)) return escapeIdPart(value);
	if (value instanceof Range) return `(${toSurqlString(value)})`;
	return toSurqlString(value);
}
//#endregion
//#region src/value/range.ts
/**
* A SurrealQL range value.
*/
var Range = class Range extends Value {
	#beg;
	#end;
	constructor(beg, end) {
		super();
		this.#beg = beg;
		this.#end = end;
	}
	equals(other) {
		if (!(other instanceof Range)) return false;
		if (this.#beg?.constructor !== other.#beg?.constructor) return false;
		if (this.#end?.constructor !== other.#end?.constructor) return false;
		return equals(this.#beg?.value, other.#beg?.value) && equals(this.#end?.value, other.#end?.value);
	}
	toJSON() {
		return this.toString();
	}
	/**
	* @returns The escaped range string
	*/
	toString() {
		const beg = escapeRangeBound(this.#beg);
		const end = escapeRangeBound(this.#end);
		return `${beg}${getRangeJoin(this.#beg, this.#end)}${end}`;
	}
	/**
	* The range bound beginning
	*/
	get begin() {
		return this.#beg;
	}
	/**
	* The range bound ending
	*/
	get end() {
		return this.#end;
	}
};
//#endregion
//#region src/value/table.ts
/**
* A SurrealQL table value.
*/
var Table = class Table extends Value {
	#name;
	constructor(tb) {
		super();
		if (typeof tb !== "string") throw new InvalidTableError("Table must be a string");
		this.#name = tb;
	}
	equals(other) {
		if (!(other instanceof Table)) return false;
		return this.#name === other.#name;
	}
	toJSON() {
		return this.toString();
	}
	/**
	* @returns The escaped table name
	*/
	toString() {
		return escapeIdent(this.#name);
	}
	/**
	* The unescaped table name
	*/
	get name() {
		return this.#name;
	}
};
const _RecordId = class RecordId extends Value {
	#table;
	#id;
	constructor(table, id) {
		super();
		if (!isValidTable(table)) throw new InvalidRecordIdError("Table part is not valid");
		if (!isValidIdPart(id)) throw new InvalidRecordIdError("ID part is not valid");
		this.#table = table instanceof Table ? table : new Table(table);
		this.#id = id;
	}
	equals(other) {
		if (!(other instanceof RecordId)) return false;
		return this.#table.equals(other.#table) && equals(this.#id, other.#id);
	}
	toJSON() {
		return this.toString();
	}
	/**
	* @returns The escaped record ID string including the table name
	*/
	toString() {
		return `${escapeIdent(this.#table.name)}:${escapeIdPart(this.#id)}`;
	}
	/**
	* The table part value
	*/
	get table() {
		return this.#table;
	}
	/**
	* The ID part value
	*/
	get id() {
		return this.#id;
	}
};
const _RecordIdRange = class RecordIdRange extends Value {
	#table;
	#beg;
	#end;
	constructor(table, beg, end) {
		super();
		if (!isValidTable(table)) throw new InvalidRecordIdError("Table part is not valid");
		if (!isValidIdBound(beg)) throw new InvalidRecordIdError("Begin bound is not valid");
		if (!isValidIdBound(end)) throw new InvalidRecordIdError("End bound is not valid");
		this.#table = table instanceof Table ? table : new Table(table);
		this.#beg = beg;
		this.#end = end;
	}
	equals(other) {
		if (!(other instanceof RecordIdRange)) return false;
		if (this.#beg?.constructor !== other.#beg?.constructor) return false;
		if (this.#end?.constructor !== other.#end?.constructor) return false;
		return this.#table.equals(other.#table) && equals(this.#beg?.value, other.#beg?.value) && equals(this.#end?.value, other.#end?.value);
	}
	toJSON() {
		return this.toString();
	}
	/**
	* @returns The escaped record ID range string
	*/
	toString() {
		const tb = escapeIdent(this.#table.name);
		const beg = escapeRangeBound(this.#beg);
		const end = escapeRangeBound(this.#end);
		return `${tb}:${beg}${getRangeJoin(this.#beg, this.#end)}${end}`;
	}
	/**
	* The table part value
	*/
	get table() {
		return this.#table;
	}
	/**
	* The range bound beginning
	*/
	get begin() {
		return this.#beg;
	}
	/**
	* The range bound ending
	*/
	get end() {
		return this.#end;
	}
};
//#endregion
//#region src/value/string-record-id.ts
/**
* A SurrealQL string-represented record ID value.
*/
var StringRecordId = class StringRecordId extends Value {
	#rid;
	constructor(rid) {
		super();
		if (rid instanceof StringRecordId) this.#rid = rid.#rid;
		else if (rid instanceof _RecordId) this.#rid = rid.toString();
		else if (typeof rid === "string") this.#rid = rid;
		else throw new InvalidTableError("String Record ID must be a string");
	}
	equals(other) {
		if (!(other instanceof StringRecordId)) return false;
		return this.#rid === other.#rid;
	}
	toJSON() {
		return this.#rid;
	}
	/**
	* @returns The string representation of the record ID
	*/
	toString() {
		return this.#rid;
	}
};
//#endregion
//#region node_modules/uuidv7/dist/index.js
/**
* uuidv7: A JavaScript implementation of UUID version 7
*
* Copyright 2021-2026 LiosK
*
* @license Apache-2.0
* @packageDocumentation
*/
const DIGITS = "0123456789abcdef";
/** Represents a UUID as a 16-byte byte array. */
var UUID = class UUID {
	/** @param bytes - The 16-byte byte array representation. */
	constructor(bytes) {
		this.bytes = bytes;
	}
	/**
	* Creates an object from the internal representation, a 16-byte byte array
	* containing the binary UUID representation in the big-endian byte order.
	*
	* This method does NOT shallow-copy the argument, and thus the created object
	* holds the reference to the underlying buffer.
	*
	* @throws TypeError if the length of the argument is not 16.
	*/
	static ofInner(bytes) {
		if (bytes.length !== 16) throw new TypeError("not 128-bit length");
		else return new UUID(bytes);
	}
	/**
	* Builds a byte array from UUIDv7 field values.
	*
	* @param unixTsMs - A 48-bit `unix_ts_ms` field value.
	* @param randA - A 12-bit `rand_a` field value.
	* @param randBHi - The higher 30 bits of 62-bit `rand_b` field value.
	* @param randBLo - The lower 32 bits of 62-bit `rand_b` field value.
	* @throws RangeError if any field value is out of the specified range.
	*/
	static fromFieldsV7(unixTsMs, randA, randBHi, randBLo) {
		if (!Number.isInteger(unixTsMs) || !Number.isInteger(randA) || !Number.isInteger(randBHi) || !Number.isInteger(randBLo) || unixTsMs < 0 || randA < 0 || randBHi < 0 || randBLo < 0 || unixTsMs > 0xffffffffffff || randA > 4095 || randBHi > 1073741823 || randBLo > 4294967295) throw new RangeError("invalid field value");
		const bytes = new Uint8Array(16);
		bytes[0] = unixTsMs / 2 ** 40;
		bytes[1] = unixTsMs / 2 ** 32;
		bytes[2] = unixTsMs / 2 ** 24;
		bytes[3] = unixTsMs / 2 ** 16;
		bytes[4] = unixTsMs / 2 ** 8;
		bytes[5] = unixTsMs;
		bytes[6] = 112 | randA >>> 8;
		bytes[7] = randA;
		bytes[8] = 128 | randBHi >>> 24;
		bytes[9] = randBHi >>> 16;
		bytes[10] = randBHi >>> 8;
		bytes[11] = randBHi;
		bytes[12] = randBLo >>> 24;
		bytes[13] = randBLo >>> 16;
		bytes[14] = randBLo >>> 8;
		bytes[15] = randBLo;
		return new UUID(bytes);
	}
	/**
	* Builds a byte array from a string representation.
	*
	* This method accepts the following formats:
	*
	* - 32-digit hexadecimal format without hyphens: `0189dcd553117d408db09496a2eef37b`
	* - 8-4-4-4-12 hyphenated format: `0189dcd5-5311-7d40-8db0-9496a2eef37b`
	* - Hyphenated format with surrounding braces: `{0189dcd5-5311-7d40-8db0-9496a2eef37b}`
	* - RFC 9562 URN format: `urn:uuid:0189dcd5-5311-7d40-8db0-9496a2eef37b`
	*
	* Leading and trailing whitespaces represents an error.
	*
	* @throws SyntaxError if the argument could not parse as a valid UUID string.
	*/
	static parse(uuid) {
		var _a, _b, _c, _d;
		let hex = void 0;
		switch (uuid.length) {
			case 32:
				hex = (_a = /^[0-9a-f]{32}$/i.exec(uuid)) === null || _a === void 0 ? void 0 : _a[0];
				break;
			case 36:
				hex = (_b = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/i.exec(uuid)) === null || _b === void 0 ? void 0 : _b.slice(1, 6).join("");
				break;
			case 38:
				hex = (_c = /^\{([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\}$/i.exec(uuid)) === null || _c === void 0 ? void 0 : _c.slice(1, 6).join("");
				break;
			case 45:
				hex = (_d = /^urn:uuid:([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/i.exec(uuid)) === null || _d === void 0 ? void 0 : _d.slice(1, 6).join("");
				break;
			default: break;
		}
		if (hex) {
			const inner = new Uint8Array(16);
			for (let i = 0; i < 16; i += 4) {
				const n = parseInt(hex.substring(2 * i, 2 * i + 8), 16);
				inner[i + 0] = n >>> 24;
				inner[i + 1] = n >>> 16;
				inner[i + 2] = n >>> 8;
				inner[i + 3] = n;
			}
			return new UUID(inner);
		} else throw new SyntaxError("could not parse UUID string");
	}
	/**
	* @returns The 8-4-4-4-12 canonical hexadecimal string representation
	* (`0189dcd5-5311-7d40-8db0-9496a2eef37b`).
	*/
	toString() {
		let text = "";
		for (let i = 0; i < this.bytes.length; i++) {
			text += DIGITS.charAt(this.bytes[i] >>> 4);
			text += DIGITS.charAt(this.bytes[i] & 15);
			if (i === 3 || i === 5 || i === 7 || i === 9) text += "-";
		}
		return text;
	}
	/**
	* @returns The 32-digit hexadecimal representation without hyphens
	* (`0189dcd553117d408db09496a2eef37b`).
	*/
	toHex() {
		let text = "";
		for (let i = 0; i < this.bytes.length; i++) {
			text += DIGITS.charAt(this.bytes[i] >>> 4);
			text += DIGITS.charAt(this.bytes[i] & 15);
		}
		return text;
	}
	/** @returns The 8-4-4-4-12 canonical hexadecimal string representation. */
	toJSON() {
		return this.toString();
	}
	/**
	* Reports the variant field value of the UUID or, if appropriate, "NIL" or
	* "MAX".
	*
	* For convenience, this method reports "NIL" or "MAX" if `this` represents
	* the Nil or Max UUID, although the Nil and Max UUIDs are technically
	* subsumed under the variants `0b0` and `0b111`, respectively.
	*/
	getVariant() {
		const n = this.bytes[8] >>> 4;
		if (n < 0) throw new Error("unreachable");
		else if (n <= 7) return this.isNil() ? "NIL" : "VAR_0";
		else if (n <= 11) return "VAR_10";
		else if (n <= 13) return "VAR_110";
		else if (n <= 15) return this.isMax() ? "MAX" : "VAR_RESERVED";
		else throw new Error("unreachable");
	}
	/**
	* Returns the version field value of the UUID or `undefined` if the UUID does
	* not have the variant field value of `0b10`.
	*/
	getVersion() {
		return this.getVariant() === "VAR_10" ? this.bytes[6] >>> 4 : void 0;
	}
	/** Returns `true` if `this` is the Nil UUID. */
	isNil() {
		return this.bytes.every((e) => e === 0);
	}
	/** Returns `true` if `this` is the Max UUID. */
	isMax() {
		return this.bytes.every((e) => e === 255);
	}
	/** Creates an object from `this`. */
	clone() {
		return new UUID(this.bytes.slice(0));
	}
	/** Returns true if `this` is equivalent to `other`. */
	equals(other) {
		return this.compareTo(other) === 0;
	}
	/**
	* Returns a negative integer, zero, or positive integer if `this` is less
	* than, equal to, or greater than `other`, respectively.
	*/
	compareTo(other) {
		for (let i = 0; i < 16; i++) {
			const diff = this.bytes[i] - other.bytes[i];
			if (diff !== 0) return Math.sign(diff);
		}
		return 0;
	}
};
/**
* Encapsulates the monotonic counter state.
*
* This class provides APIs to utilize a separate counter state from that of the
* global generator used by {@link uuidv7} and {@link uuidv7obj}. In addition to
* the default {@link generate} method, this class has {@link generateOrAbort}
* that is useful to absolutely guarantee the monotonically increasing order of
* generated UUIDs. See their respective documentation for details.
*/
var V7Generator = class {
	/**
	* Creates a generator object with the default random number generator, or
	* with the specified one if passed as an argument. The specified random
	* number generator should be cryptographically strong and securely seeded.
	*/
	constructor(randomNumberGenerator) {
		/**
		* Biased by one to distinguish zero (uninitialized) and zero (UNIX epoch).
		*/
		this.timestampBiased = 0;
		this.counter = 0;
		this.rollbackAllowance = 1e4;
		this.random = randomNumberGenerator !== null && randomNumberGenerator !== void 0 ? randomNumberGenerator : getDefaultRandom();
	}
	/**
	* Sets the `rollbackAllowance` parameter of the generator.
	*
	* The `rollbackAllowance` parameter specifies the amount of `unixTsMs`
	* rollback that is considered significant. The default value is `10_000`
	* (milliseconds). See the {@link generate} or {@link generateOrAbort}
	* documentation for the treatment of the significant rollback.
	*
	*/
	setRollbackAllowance(rollbackAllowance) {
		if (rollbackAllowance < 0 || rollbackAllowance > 0xffffffffffff) throw new RangeError("`rollbackAllowance` out of reasonable range");
		this.rollbackAllowance = rollbackAllowance;
	}
	/**
	* Generates a new UUIDv7 object from the current timestamp, or resets the
	* generator upon significant timestamp rollback.
	*
	* This method returns a monotonically increasing UUID by reusing the previous
	* timestamp even if the up-to-date timestamp is smaller than the immediately
	* preceding UUID's. However, when such a clock rollback is considered
	* significant (by default, more than ten seconds), this method resets the
	* generator and returns a new UUID based on the given timestamp, breaking the
	* increasing order of UUIDs.
	*
	* See {@link generateOrAbort} for the other mode of generation and
	* {@link generateOrResetWithTs} for the variant accepting a custom timestamp.
	*/
	generate() {
		return this.generateOrResetWithTs(Date.now());
	}
	/**
	* Generates a new UUIDv7 object from the current timestamp, or returns
	* `undefined` upon significant timestamp rollback.
	*
	* This method returns a monotonically increasing UUID by reusing the previous
	* timestamp even if the up-to-date timestamp is smaller than the immediately
	* preceding UUID's. However, when such a clock rollback is considered
	* significant (by default, more than ten seconds), this method aborts and
	* returns `undefined` immediately.
	*
	* See {@link generate} for the other mode of generation and
	* {@link generateOrAbortWithTs} for the variant accepting a custom timestamp.
	*/
	generateOrAbort() {
		return this.generateOrAbortWithTs(Date.now());
	}
	/**
	* Generates a new UUIDv7 object from the `unixTsMs` passed, or resets the
	* generator upon significant timestamp rollback.
	*
	* This method is equivalent to {@link generate} except that it takes a custom
	* timestamp.
	*
	* @throws RangeError if `unixTsMs` is not a 48-bit unsigned integer.
	*/
	generateOrResetWithTs(unixTsMs) {
		let value = this.generateOrAbortWithTs(unixTsMs);
		if (value === void 0) {
			this.timestampBiased = 0;
			value = this.generateOrAbortWithTs(unixTsMs);
		}
		return value;
	}
	/**
	* Generates a new UUIDv7 object from the `unixTsMs` passed, or returns
	* `undefined` upon significant timestamp rollback.
	*
	* This method is equivalent to {@link generateOrAbort} except that it takes a
	* custom timestamp.
	*
	* @throws RangeError if `unixTsMs` is not a 48-bit unsigned integer.
	*/
	generateOrAbortWithTs(unixTsMs) {
		const MAX_COUNTER = 4398046511103;
		if (!Number.isInteger(unixTsMs) || unixTsMs < 0 || unixTsMs > 0xffffffffffff) throw new RangeError("`unixTsMs` must be a 48-bit unsigned integer");
		unixTsMs++;
		if (unixTsMs > this.timestampBiased) {
			this.timestampBiased = unixTsMs;
			this.resetCounter();
		} else if (unixTsMs + this.rollbackAllowance >= this.timestampBiased) {
			this.counter++;
			if (this.counter > MAX_COUNTER) {
				this.timestampBiased++;
				this.resetCounter();
			}
		} else return;
		return UUID.fromFieldsV7(this.timestampBiased - 1, Math.trunc(this.counter / 2 ** 30), this.counter & 2 ** 30 - 1, this.random.nextUint32());
	}
	/**
	* Generates a new UUIDv7 object from the `unixTsMs` passed, or resets the
	* generator upon significant timestamp rollback.
	*
	* This method is a deprecated version of {@link generateOrResetWithTs} that
	* accepts the `rollbackAllowance` parameter as an argument, rather than using
	* the generator-level parameter.
	*
	* @param rollbackAllowance - The amount of `unixTsMs` rollback that is
	* considered significant. A suggested value is `10_000` (milliseconds).
	* @throws RangeError if `unixTsMs` is not a 48-bit unsigned integer.
	* @deprecated Since v1.2.0. Use {@link generateOrResetWithTs} instead.
	*/
	generateOrResetCore(unixTsMs, rollbackAllowance) {
		const origRollbackAllowance = this.rollbackAllowance;
		try {
			this.setRollbackAllowance(rollbackAllowance);
			return this.generateOrResetWithTs(unixTsMs);
		} catch (e) {
			throw e;
		} finally {
			this.rollbackAllowance = origRollbackAllowance;
		}
	}
	/**
	* Generates a new UUIDv7 object from the `unixTsMs` passed, or returns
	* `undefined` upon significant timestamp rollback.
	*
	* This method is a deprecated version of {@link generateOrAbortWithTs} that
	* accepts the `rollbackAllowance` parameter as an argument, rather than using
	* the generator-level parameter.
	*
	* @param rollbackAllowance - The amount of `unixTsMs` rollback that is
	* considered significant. A suggested value is `10_000` (milliseconds).
	* @throws RangeError if `unixTsMs` is not a 48-bit unsigned integer.
	* @deprecated Since v1.2.0. Use {@link generateOrAbortWithTs} instead.
	*/
	generateOrAbortCore(unixTsMs, rollbackAllowance) {
		const origRollbackAllowance = this.rollbackAllowance;
		try {
			this.setRollbackAllowance(rollbackAllowance);
			return this.generateOrAbortWithTs(unixTsMs);
		} catch (e) {
			throw e;
		} finally {
			this.rollbackAllowance = origRollbackAllowance;
		}
	}
	/** Initializes the counter at a 42-bit random integer. */
	resetCounter() {
		this.counter = this.random.nextUint32() * 1024 + (this.random.nextUint32() & 1023);
	}
	/**
	* Generates a new UUIDv4 object utilizing the random number generator inside.
	*
	* @internal
	*/
	generateV4() {
		const bytes = new Uint8Array(Uint32Array.of(this.random.nextUint32(), this.random.nextUint32(), this.random.nextUint32(), this.random.nextUint32()).buffer);
		bytes[6] = 64 | bytes[6] >>> 4;
		bytes[8] = 128 | bytes[8] >>> 2;
		return UUID.ofInner(bytes);
	}
};
/** Returns the default random number generator available in the environment. */
const getDefaultRandom = () => {
	if (typeof crypto !== "undefined" && typeof crypto.getRandomValues !== "undefined") return new BufferedCryptoRandom();
	else {
		if (typeof UUIDV7_DENY_WEAK_RNG !== "undefined" && UUIDV7_DENY_WEAK_RNG) throw new Error("no cryptographically strong RNG available");
		return { nextUint32: () => Math.trunc(Math.random() * 65536) * 65536 + Math.trunc(Math.random() * 65536) };
	}
};
/**
* Wraps `crypto.getRandomValues()` to enable buffering; this uses a small
* buffer by default to avoid both unbearable throughput decline in some
* environments and the waste of time and space for unused values.
*/
var BufferedCryptoRandom = class {
	constructor() {
		this.buffer = new Uint32Array(8);
		this.cursor = 65535;
	}
	nextUint32() {
		if (this.cursor >= this.buffer.length) {
			crypto.getRandomValues(this.buffer);
			this.cursor = 0;
		}
		return this.buffer[this.cursor++];
	}
};
let defaultGenerator;
/** Generates a UUIDv7 object. */
const uuidv7obj = () => (defaultGenerator || (defaultGenerator = new V7Generator())).generate();
/** Generates a UUIDv4 object. */
const uuidv4obj = () => (defaultGenerator || (defaultGenerator = new V7Generator())).generateV4();
//#endregion
//#region src/value/uuid.ts
/**
* A SurrealQL UUID value.
*/
var Uuid = class Uuid extends Value {
	#inner;
	constructor(uuid) {
		super();
		if (uuid instanceof ArrayBuffer) this.#inner = UUID.ofInner(new Uint8Array(uuid));
		else if (uuid instanceof Uint8Array) this.#inner = UUID.ofInner(uuid);
		else if (uuid instanceof Uuid) this.#inner = uuid.#inner;
		else if (uuid instanceof UUID) this.#inner = uuid;
		else this.#inner = UUID.parse(uuid);
	}
	equals(other) {
		if (!(other instanceof Uuid)) return false;
		return this.#inner.equals(other.#inner);
	}
	toJSON() {
		return this.#inner.toString();
	}
	/**
	* @returns The string representation of the UUID
	*/
	toString() {
		return this.#inner.toString();
	}
	/**
	* Converts the UUID to a Uint8Array
	*/
	toUint8Array() {
		return this.#inner.bytes;
	}
	/**
	* Converts the UUID to a ArrayBuffer
	*/
	toBuffer() {
		return this.#inner.bytes.buffer;
	}
	/**
	* Generate a new UUID v4
	*/
	static v4() {
		return new Uuid(uuidv4obj());
	}
	/**
	* Generate a new UUID v7
	*/
	static v7() {
		return new Uuid(uuidv7obj());
	}
};
//#endregion
//#region src/internal/validation.ts
function isValidIdPart(v) {
	if (v instanceof Uuid) return true;
	switch (typeof v) {
		case "string":
		case "number":
		case "bigint": return true;
		case "object":
			if (v === null) return false;
			if (Array.isArray(v)) return true;
			return isPlainObject(v);
		default: return false;
	}
}
function isPlainObject(v) {
	if (v === null || typeof v !== "object") return false;
	const proto = Object.getPrototypeOf(v);
	return proto === null || proto === Object.prototype;
}
function isValidIdBound(bound) {
	return bound instanceof BoundIncluded || bound instanceof BoundExcluded ? isValidIdPart(bound.value) : true;
}
function isValidTable(tb) {
	return tb instanceof Table || typeof tb === "string";
}
function isExpression(value) {
	return !!value && typeof value === "object" && "toSQL" in value;
}
//#endregion
//#region src/utils/expr.ts
const _join = (xs, op) => ({ toSQL: (ctx) => {
	const parts = xs.filter(Boolean).map((e) => e.toSQL(ctx)).filter(Boolean);
	if (!parts.length) return "";
	if (parts.length === 1) return parts[0];
	return `(${parts.join(` ${op} `)})`;
} });
/**
* Parse a SurrealQL expression to a BoundQuery
*
* @param expr The SurrealQL expression
* @returns A BoundQuery instance
*/
function expr(expr) {
	const params = {};
	const ctx = { def(value) {
		const bindingName = `bind__${getIncrementalID()}`;
		params[bindingName] = value;
		return `$${bindingName}`;
	} };
	try {
		return new BoundQuery(expr ? expr.toSQL(ctx) : "", params);
	} catch (error) {
		throw new ExpressionError(error);
	}
}
/**
* Represents a raw SurrealQL expression
*
* **IMPORTANT**: This function should only be used when no other operator is applicable.
* Incorrect use of this function will risk exposing queries to SQL injection.
*
* @param s The raw value
*/
const raw = (s) => ({ toSQL: () => s });
/**
* Represents a equality comparison operation (=)
*
* @param field The field name
* @param v The value to compare against
*/
const eq = (field, v) => ({ toSQL: (ctx) => `${field} = ${ctx.def(v)}` });
/**
* Represents an exact equality comparison operation (==)
*
* @param field The field name
* @param v The value to compare against
*/
const eeq = (field, v) => ({ toSQL: (ctx) => `${field} == ${ctx.def(v)}` });
/**
* Represents a not equal comparison operation (!=)
*
* @param field The field name
* @param v The value to compare against
*/
const ne = (field, v) => ({ toSQL: (ctx) => `${field} != ${ctx.def(v)}` });
/**
* Represents a greater than comparison operation (>)
*
* @param field The field name
* @param v The value to compare against
*/
const gt = (field, v) => ({ toSQL: (ctx) => `${field} > ${ctx.def(v)}` });
/**
* Represents a greater than or equal to comparison operation (>=)
*
* @param field The field name
* @param v The value to compare against
*/
const gte = (field, v) => ({ toSQL: (ctx) => `${field} >= ${ctx.def(v)}` });
/**
* Represents a less than comparison operation (<)
*
* @param field The field name
* @param v The value to compare against
*/
const lt = (field, v) => ({ toSQL: (ctx) => `${field} < ${ctx.def(v)}` });
/**
* Represents a less than or equal to comparison operation (<=)
*
* @param field The field name
* @param v The value to compare against
*/
const lte = (field, v) => ({ toSQL: (ctx) => `${field} <= ${ctx.def(v)}` });
/**
* Represents a contains operation (CONTAINS)
*
* @param field The field name
* @param v The value to compare against
*/
const contains = (field, v) => ({ toSQL: (ctx) => `${field} CONTAINS ${ctx.def(v)}` });
/**
* Represents a contains any operation (CONTAINSANY)
*
* @param field The field name
* @param v The value to compare against
*/
const containsAny = (field, v) => ({ toSQL: (ctx) => `${field} CONTAINSANY ${ctx.def(v)}` });
/**
* Represents a contains all operation (CONTAINSALL)
*
* @param field The field name
* @param v The value to compare against
*/
const containsAll = (field, v) => ({ toSQL: (ctx) => `${field} CONTAINSALL ${ctx.def(v)}` });
/**
* Represents a contains none operation (CONTAINSNONE)
*
* @param field The field name
* @param v The value to compare against
*/
const containsNone = (field, v) => ({ toSQL: (ctx) => `${field} CONTAINSNONE ${ctx.def(v)}` });
/**
* Represents an inside operation (INSIDE)
*
* @param field The field name
* @param v The value to compare against
*/
const inside = (field, v) => ({ toSQL: (ctx) => `${field} INSIDE ${ctx.def(v)}` });
/**
* Represents a geometry outside operation (OUTSIDE)
*
* @param field The field name
* @param g The value to compare against
*/
const outside = (field, g) => ({ toSQL: (ctx) => `${field} OUTSIDE ${ctx.def(g)}` });
/**
* Represents a geometry intersects operation (INTERSECTS)
*
* @param field The field name
* @param g The value to compare against
*/
const intersects = (field, g) => ({ toSQL: (ctx) => `${field} INTERSECTS ${ctx.def(g)}` });
/**
* Represents a full-text search match operation (@@)
*
* @param field The field name
* @param q The value to compare against
* @param ref The optional reference number
*/
const matches = (field, q, ref) => ({ toSQL: (ctx) => `${field} ${Number.isInteger(ref) ? `@${ref}@` : "@@"} ${ctx.def(q)}` });
/**
* Represents a KNN nearest neighbor operation
*
* Supported operations include:
* - Brute Force: <|n,metric|>, where n is the number of neighbors and metric is the metric to use
* - MTree: <|n|>, where n is the number of neighbors
* - HNSW: <|n,ef|>, where n is the number of neighbors and ef is the ef
*
* @param field The field name
* @param v The value to compare against
* @param neighbors The number of neighbors
* @param metricOrEf The optional metric or ef
*/
const knn = (field, v, neighbors, metricOrEf) => ({ toSQL: (ctx) => {
	if (!Number.isInteger(neighbors)) throw new ExpressionError("neighbors must be an integer");
	if (metricOrEf !== void 0 && !Number.isInteger(metricOrEf) && !/\w+/.test(metricOrEf)) throw new ExpressionError("metric is invalid");
	return `${field} <|${neighbors}${metricOrEf ? `,${metricOrEf}` : ""}|> ${ctx.def(v)}`;
} });
/**
* Represents a between operation. This is a shortcut for `and(gte(field, a), lte(field, b))`
*
* @param field The field name
* @param a The lower bound
* @param b The upper bound
*/
const between = (field, a, b) => ({ toSQL: (ctx) => and(gte(field, a), lte(field, b)).toSQL(ctx) });
/**
* Represents a logical AND operation
*
* @param exprs The expressions to join
* @returns A new expression
*/
const and = (...exprs) => _join(exprs, "AND");
/**
* Represents a logical OR operation
*
* @param exprs The expressions to join
* @returns A new expression
*/
const or = (...exprs) => _join(exprs, "OR");
/**
* Represents a logical NOT operation
*
* @param expr The expression to negate
* @returns A new expression
*/
const not = (expr) => ({ toSQL: (ctx) => {
	const s = expr && expr.toSQL(ctx);
	return s ? `NOT(${s})` : "";
} });
//#endregion
//#region src/utils/tagged-template.ts
/**
* A template literal tag function for creating BoundQuery instances from query strings.
* Interpolated values are automatically stored as bindings with unique names.
*
* @param strings The template string segments
* @param values The interpolated values
* @example const query = surql`SELECT * FROM users WHERE name = ${name}`;
* @returns A BoundQuery instance
*/
function surql(strings, ...values) {
	const bindings = {};
	let result = "";
	for (let i = 0; i < strings.length; i++) {
		result += strings[i];
		if (i < values.length) {
			const value = values[i];
			if (value instanceof BoundQuery) {
				result += value.query;
				mergeBindings(bindings, value.bindings);
			} else if (isExpression(value)) {
				const built = expr(value);
				result += built.query;
				mergeBindings(bindings, built.bindings);
			} else {
				const bindingName = `bind__${getIncrementalID()}`;
				result += `$${bindingName}`;
				bindings[bindingName] = value;
			}
		}
	}
	return new BoundQuery(result, bindings);
}
//#endregion
//#region src/utils/bound-query.ts
/**
* Merge source bindings into target, throwing on duplicate keys.
*
* @param target The target bindings object to merge into
* @param source The source bindings object to merge from
*/
function mergeBindings(target, source) {
	for (const key of Object.keys(source)) if (key in target) throw new ExpressionError(`Parameter conflict: '${key}' already exists in this BoundQuery`);
	Object.assign(target, source);
}
/**
* A bound query represents a query string combined with bindings.
*/
var BoundQuery = class BoundQuery {
	#query;
	#bindings;
	constructor(query, bindings) {
		if (query instanceof BoundQuery) {
			this.#query = query.query;
			this.#bindings = { ...query.bindings };
		} else if (query) {
			this.#query = query;
			this.#bindings = { ...bindings };
		} else {
			this.#query = "";
			this.#bindings = {};
		}
	}
	/**
	* Retrieves the query string.
	*/
	get query() {
		return this.#query;
	}
	/**
	* Retrieves a copy of the configured bindings.
	*/
	get bindings() {
		return { ...this.#bindings };
	}
	append(other, ...values) {
		const _other = this.#extractQuery(other, values);
		if (_other.#bindings) mergeBindings(this.#bindings, _other.#bindings);
		this.#query += _other.query;
		return this;
	}
	#extractQuery(other, values) {
		if (other instanceof BoundQuery) return other;
		if (typeof other === "string") return new BoundQuery(other, values[0]);
		if (Array.isArray(other)) return surql(other, ...values);
		throw new ExpressionError("Invalid query component");
	}
};
//#endregion
//#region src/utils/channel-iterator.ts
/**
* The channel iterator is a utility class that allows you to submit values to an async iterator.
*/
var ChannelIterator = class {
	#cancelled = false;
	#queue = [];
	#waiter;
	#cleanup;
	constructor(cleanup) {
		this.#cleanup = cleanup;
	}
	next() {
		if (this.#cancelled) return Promise.resolve({
			value: void 0,
			done: true
		});
		if (this.#queue.length > 0) return Promise.resolve({
			value: this.#queue.shift(),
			done: false
		});
		return new Promise((resolve) => {
			this.#waiter = resolve;
		});
	}
	return() {
		this.#cancelled = true;
		this.#cleanup?.();
		this.#waiter?.({
			value: void 0,
			done: true
		});
		return Promise.resolve({
			value: void 0,
			done: true
		});
	}
	throw(error) {
		this.#cancelled = true;
		this.#cleanup?.();
		if (this.#waiter) {
			this.#waiter({
				value: void 0,
				done: true
			});
			this.#waiter = void 0;
		}
		return Promise.reject(error);
	}
	[Symbol.asyncIterator]() {
		return this;
	}
	submit(value) {
		if (this.#cancelled) return;
		if (this.#waiter) {
			this.#waiter({
				value,
				done: false
			});
			return;
		}
		this.#queue.push(value);
	}
	cancel() {
		this.#cancelled = true;
		this.#cleanup?.();
		this.#waiter?.({
			value: void 0,
			done: true
		});
	}
};
//#endregion
//#region src/utils/is-version-supported.ts
const MINIMUM_VERSION = "2.1.0";
const MAXIMUM_VERSION = "4.0.0";
/**
* Returns whether a SurrealDB version is supported by the SDK.
*
* @param version The SurrealDB version to check
* @param min The minimum version to check against
* @param until The maximum version to check against
* @returns Whether the version is supported
*/
function isVersionSupported(version, min = MINIMUM_VERSION, until = MAXIMUM_VERSION) {
	const trimmed = version.replace(/^surrealdb-/, "").trim();
	return min.localeCompare(trimmed, void 0, { numeric: true }) <= 0 && until.localeCompare(trimmed, void 0, { numeric: true }) === 1;
}
//#endregion
//#region src/internal/feature.ts
var Feature = class {
	#name;
	#since;
	#until;
	constructor(name, since, until) {
		this.#name = name;
		this.#since = since;
		this.#until = until;
	}
	get name() {
		return this.#name;
	}
	get sinceVersion() {
		return this.#since;
	}
	get untilVersion() {
		return this.#until;
	}
	supports(version) {
		return isVersionSupported(version, this.#since ?? "2.1.0", this.#until ?? "4.0.0");
	}
};
//#endregion
//#region src/utils/features.ts
/**
* Available features which may be supported by specific
* engines or versions of SurrealDB.
*/
const Features = Object.freeze({
	LiveQueries: new Feature("live-queries"),
	Sessions: new Feature("sessions", "3.0.0"),
	Api: new Feature("api", "3.0.0"),
	RefreshTokens: new Feature("refresh-tokens", "3.0.0"),
	Transactions: new Feature("transactions", "3.0.0"),
	ExportImportRaw: new Feature("export-import-raw"),
	SurrealML: new Feature("surreal-ml")
});
//#endregion
//#region src/utils/frame.ts
/**
* Represents a single query result frame frame
*/
var Frame = class {
	query;
	constructor(query) {
		this.query = query;
	}
	/**
	* Returns true if the frame is associated with the given query index
	*/
	isOf(query) {
		return this.query === query;
	}
	/**
	* Returns true if the frame is a value frame
	*/
	isValue() {
		return this instanceof ValueFrame;
	}
	/**
	* Returns true if the frame is an error frame
	*/
	isError() {
		return this instanceof ErrorFrame;
	}
	/**
	* Returns true if the frame is a done frame
	*/
	isDone() {
		return this instanceof DoneFrame;
	}
	/**
	* Returns true if the frame is a value frame and associated with the given query index
	*/
	isValueOf(query) {
		return this.isOf(query) && this.isValue();
	}
	/**
	* Returns true if the frame is an error frame and associated with the given query index
	*/
	isErrorOf(query) {
		return this.isOf(query) && this.isError();
	}
	/**
	* Returns true if the frame is a done frame and associated with the given query index
	*/
	isDoneOf(query) {
		return this.isOf(query) && this.isDone();
	}
};
/**
* Represents a value frame in a query result. If `isSingle` is true, the frame represents a single value
* and no further values will be returned for that specific statement.
*/
var ValueFrame = class extends Frame {
	value;
	isSingle;
	constructor(query, value, isSingle) {
		super(query);
		this.value = value;
		this.isSingle = isSingle;
	}
	isOf(query) {
		return super.isOf(query);
	}
};
/**
* Represents an error frame in a query result
*/
var ErrorFrame = class extends Frame {
	stats;
	error;
	constructor(query, stats, error) {
		super(query);
		this.stats = stats;
		this.error = error;
	}
	isOf(query) {
		return super.isOf(query);
	}
	/**
	* Throw the server error corresponding to this error frame
	*/
	throw() {
		throw this.error;
	}
};
/**
* Represents a done frame in a query result
*/
var DoneFrame = class extends Frame {
	stats;
	type;
	constructor(query, stats, type) {
		super(query);
		this.stats = stats;
		this.type = type;
	}
	isOf(query) {
		return super.isOf(query);
	}
};
//#endregion
//#region src/utils/jsonify.ts
/**
* Recursively convert any supported SurrealQL value into a serializable JSON representation.
*
* @param input The input value
* @returns JSON-safe representation
*/
function jsonify(input) {
	if (typeof input === "object") {
		if (input === null) return null;
		if (input instanceof Date || input instanceof Value) return input.toJSON();
		switch (Object.getPrototypeOf(input)) {
			case Object.prototype: {
				const mapped = Object.entries(input).map(([k, v]) => [k, jsonify(v)]).filter(([_, v]) => v !== void 0);
				return Object.fromEntries(mapped);
			}
			case Map.prototype: {
				const mapped = Array.from(input).map(([k, v]) => [k, jsonify(v)]).filter(([_, v]) => v !== void 0);
				return new Map(mapped);
			}
			case Array.prototype: return input.map(jsonify);
			case Set.prototype: return new Set([...input].map(jsonify));
		}
	}
	return input;
}
//#endregion
//#region src/internal/maybe-jsonify.ts
function maybeJsonify(value, apply) {
	return apply ? jsonify(value) : value;
}
//#endregion
//#region src/query/query.ts
/**
* A configurable query sent to a SurrealDB instance.
*/
var Query = class Query extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options;
	}
	/**
	* Retrieve the inner query that will be sent to the database.
	*/
	get inner() {
		return this.#options.query;
	}
	/**
	* Configure the query to return the result of each response as a
	* JSON-compatible structure.
	*
	* This is useful when query results need to be serialized. Keep in mind
	* that your responses will lose SurrealDB type information.
	*/
	json() {
		return new Query(this.#connection, {
			...this.#options,
			json: true
		});
	}
	/**
	* Collect and return the results of all queries at once. If any of the queries fail, the promise
	* will reject.
	*
	* You can optionally pass a list of query indexes to collect only the results of specific queries.
	*
	* This is the same as awaiting the query directly, but allows specifying which queries to collect.
	*
	* @example
	* ```ts
	* const [people] = await this.query("SELECT * FROM person").collect<[Person[]]>();
	* ```
	*
	* @param queries The queries to collect. If no queries are provided, all queries will be collected.
	* @returns A promise that resolves to the results of all queries at once.
	*/
	async collect(...queries) {
		await this.#connection.ready();
		const { query, transaction, session, json } = this.#options;
		const chunks = this.#connection.query(query, session, transaction);
		const responses = [];
		const queryIndexes = queries.length > 0 ? new Map(queries.map((idx, i) => [idx, i])) : void 0;
		for await (const chunk of chunks) {
			if (chunk.error) throw chunk.error;
			if (queryIndexes?.has(chunk.query) === false) continue;
			const index = queryIndexes?.get(chunk.query) ?? chunk.query;
			if (chunk.kind === "single") {
				responses[index] = maybeJsonify(chunk.result?.[0], json);
				continue;
			}
			const additions = maybeJsonify(chunk.result ?? [], json);
			let records = responses[index];
			if (!records) {
				records = additions;
				responses[index] = records;
			} else records.push(...additions);
		}
		return responses;
	}
	/**
	* Stream the response frames of the query as they are received as an AsyncIterable.
	*
	* Each iteration yields a **value**, **error**, or **done** frame. The provided
	* `isValue`, `isError`, and `isDone` methods can be used to check the type of frame.
	* You can pass a query index to these functions to check if the frame is associated with a
	* specific query.
	*
	* @example
	* ```ts
	* const stream = this.query("SELECT * FROM person").stream();
	*
	* for await (const frame of stream) {
	*     if (frame.isValue<Person>(0)) {
	*         // use frame.value
	*     }
	* }
	* ```
	*
	* @returns An async iterable of query frames.
	*/
	async *stream() {
		await this.#connection.ready();
		const { query, transaction, session, json } = this.#options;
		const chunks = this.#connection.query(query, session, transaction);
		for await (const chunk of chunks) {
			if (chunk.error) {
				yield new ErrorFrame(chunk.query, chunk.stats, chunk.error);
				continue;
			}
			if (chunk.kind === "single") {
				yield new ValueFrame(chunk.query, maybeJsonify(chunk.result?.[0], json), true);
				yield new DoneFrame(chunk.query, chunk.stats, chunk.type ?? "other");
				continue;
			}
			const values = chunk.result;
			for (const value of values) yield new ValueFrame(chunk.query, maybeJsonify(value, json), false);
			if (chunk.kind === "batched-final") yield new DoneFrame(chunk.query, chunk.stats, chunk.type ?? "other");
		}
	}
	/**
	* Collect and return the responses of all queries at once. Failed queries will be returned
	* with `success: false` and the associated error, while successful queries will have
	* `success: true` and their result.
	*
	* You can optionally pass a list of query indexes to collect only the results of specific responses.
	*
	* @example
	* ```ts
	* const [people] = await this.query("SELECT * FROM person").responses<[Person[]]>();
	*
	* people.success; // true
	* people.result; // Person[]
	* ```
	*
	* @param queries The queries to collect. If no queries are provided, all queries will be collected.
	* @returns A promise that resolves to the responses of all queries at once.
	*/
	async responses(...queries) {
		await this.#connection.ready();
		const { query, transaction, session, json } = this.#options;
		const chunks = this.#connection.query(query, session, transaction);
		const collections = [];
		const responses = [];
		const queryIndexes = queries.length > 0 ? new Map(queries.map((idx, i) => [idx, i])) : void 0;
		for await (const chunk of chunks) {
			if (queryIndexes?.has(chunk.query) === false) {
				if (chunk.error) throw chunk.error;
				continue;
			}
			const index = queryIndexes?.get(chunk.query) ?? chunk.query;
			if (chunk.error) {
				responses[index] = {
					success: false,
					error: chunk.error,
					stats: chunk.stats
				};
				continue;
			}
			if (chunk.kind === "single") {
				responses[index] = {
					success: true,
					result: maybeJsonify(chunk.result?.[0], json),
					stats: chunk.stats,
					type: chunk.type ?? "other"
				};
				continue;
			}
			const additions = maybeJsonify(chunk.result ?? [], json);
			let records = collections[index];
			if (!records) {
				records = additions;
				collections[index] = records;
			} else records.push(...additions);
			if (chunk.kind === "batched-final") responses[index] = {
				success: true,
				result: records,
				stats: chunk.stats,
				type: chunk.type ?? "other"
			};
		}
		return responses;
	}
	async dispatch() {
		return this.collect();
	}
};
//#endregion
//#region src/query/auth.ts
/**
* A configurable `Promise` for retrieving auth information from a SurrealDB instance.
*/
var AuthPromise = class AuthPromise extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options;
	}
	/**
	* Configure the query to return the result as a
	* JSON-compatible structure.
	*
	* This is useful when query results need to be serialized. Keep in mind
	* that your responses will lose SurrealDB type information.
	*/
	json() {
		return new AuthPromise(this.#connection, {
			...this.#options,
			json: true
		});
	}
	/**
	* Compile this qurery into a BoundQuery
	*/
	compile() {
		return this.#build().inner;
	}
	/**
	* Stream the results of the query as they are received.
	*
	* @returns An async iterable of query frames.
	*/
	async *stream() {
		await this.#connection.ready();
		const query = this.#build().stream();
		for await (const frame of query) yield frame;
	}
	async dispatch() {
		await this.#connection.ready();
		const [result] = await this.#build().collect();
		return result;
	}
	#build() {
		const { transaction, session, json } = this.#options;
		return new Query(this.#connection, {
			query: new BoundQuery("SELECT * FROM ONLY $auth"),
			transaction,
			session,
			json
		});
	}
};
//#endregion
//#region src/internal/internal-expressions.ts
const OUTPUTS = new Map([
	["null", "null"],
	["none", "NONE"],
	["diff", "DIFF"],
	["before", "BEFORE"],
	["after", "AFTER"]
]);
const _only = (value) => ({ toSQL: (ctx) => value instanceof _RecordId || value instanceof StringRecordId ? `ONLY ${ctx.def(value)}` : ctx.def(value) });
const _output = (value) => ({ toSQL: () => {
	const output = OUTPUTS.get(value);
	if (!output) throw new ExpressionError(`Invalid output value: ${value}`);
	return output;
} });
const _timeout = (timeout) => ({ toSQL: () => {
	if (!(timeout instanceof Duration)) throw new ExpressionError(`Invalid timeout value: ${timeout}`);
	return `TIMEOUT ${timeout.toString()}`;
} });
//#endregion
//#region src/query/create.ts
/**
* A configurable `Promise` for a create query sent to a SurrealDB instance.
*/
var CreatePromise = class CreatePromise extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options;
	}
	/**
	* Configure the query to return the result as a
	* JSON-compatible structure.
	*
	* This is useful when query results need to be serialized. Keep in mind
	* that your responses will lose SurrealDB type information.
	*/
	json() {
		return new CreatePromise(this.#connection, {
			...this.#options,
			json: true
		});
	}
	/**
	* Configure the query to set the record data
	*/
	content(data) {
		return new CreatePromise(this.#connection, {
			...this.#options,
			mutation: "content",
			data
		});
	}
	/**
	* Configure the query to patch the record data
	*/
	patch(data) {
		return new CreatePromise(this.#connection, {
			...this.#options,
			mutation: "patch",
			data
		});
	}
	/**
	* Configure the output of the query
	*/
	output(output) {
		return new CreatePromise(this.#connection, {
			...this.#options,
			output
		});
	}
	/**
	* Configure the timeout of the query
	*/
	timeout(timeout) {
		return new CreatePromise(this.#connection, {
			...this.#options,
			timeout
		});
	}
	/**
	* Configure a custom version of the data being created. This is used
	* alongside version enabled storage engines such as SurrealKV.
	*/
	version(version) {
		return new CreatePromise(this.#connection, {
			...this.#options,
			version
		});
	}
	/**
	* Compile this qurery into a BoundQuery
	*/
	compile() {
		return this.#build().inner;
	}
	/**
	* Stream the results of the query as they are received.
	*
	* @returns An async iterable of query frames.
	*/
	async *stream() {
		await this.#connection.ready();
		const query = this.#build().stream();
		for await (const frame of query) yield frame;
	}
	async dispatch() {
		await this.#connection.ready();
		const [result] = await this.#build().collect();
		return result;
	}
	#build() {
		const { what, data, transaction, session, json, output, timeout, version, mutation } = this.#options;
		const query = surql`CREATE ${_only(what)}`;
		if (mutation && data) query.append(surql` ${raw(mutation.toUpperCase())} ${data}`);
		if (output) query.append(surql` RETURN ${_output(output)}`);
		if (timeout) query.append(surql` TIMEOUT ${_timeout(timeout)}`);
		if (version) query.append(surql` VERSION ${version}`);
		return new Query(this.#connection, {
			query,
			transaction,
			json,
			session
		});
	}
};
//#endregion
//#region src/query/delete.ts
/**
* A configurable `Promise` for a delete query sent to a SurrealDB instance.
*/
var DeletePromise = class DeletePromise extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options;
	}
	/**
	* Configure the query to return the result as a
	* JSON-compatible structure.
	*
	* This is useful when query results need to be serialized. Keep in mind
	* that your responses will lose SurrealDB type information.
	*/
	json() {
		return new DeletePromise(this.#connection, {
			...this.#options,
			json: true
		});
	}
	/**
	* Configure the output of the query
	*/
	output(output) {
		return new DeletePromise(this.#connection, {
			...this.#options,
			output
		});
	}
	/**
	* Configure the timeout of the query
	*/
	timeout(timeout) {
		return new DeletePromise(this.#connection, {
			...this.#options,
			timeout
		});
	}
	/**
	* Configure a custom version of the data being created. This is used
	* alongside version enabled storage engines such as SurrealKV.
	*/
	version(version) {
		return new DeletePromise(this.#connection, {
			...this.#options,
			version
		});
	}
	/**
	* Compile this qurery into a BoundQuery
	*/
	compile() {
		return this.#build().inner;
	}
	/**
	* Stream the results of the query as they are received.
	*
	* @returns An async iterable of query frames.
	*/
	async *stream() {
		await this.#connection.ready();
		const query = this.#build().stream();
		for await (const frame of query) yield frame;
	}
	async dispatch() {
		await this.#connection.ready();
		const [result] = await this.#build().collect();
		return result;
	}
	#build() {
		const { what, transaction, session, json, output, timeout, version } = this.#options;
		const query = surql`DELETE ${_only(what)}`;
		if (output) query.append(surql` RETURN ${_output(output)}`);
		if (timeout) query.append(surql` TIMEOUT ${_timeout(timeout)}`);
		if (version) query.append(surql` VERSION ${version}`);
		return new Query(this.#connection, {
			query,
			transaction,
			json,
			session
		});
	}
};
//#endregion
//#region src/query/insert.ts
/**
* A configurable `Promise` for an insert query sent to a SurrealDB instance.
*/
var InsertPromise = class InsertPromise extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options;
	}
	/**
	* Configure the query to return the result as a
	* JSON-compatible structure.
	*
	* This is useful when query results need to be serialized. Keep in mind
	* that your responses will lose SurrealDB type information.
	*/
	json() {
		return new InsertPromise(this.#connection, {
			...this.#options,
			json: true
		});
	}
	/**
	* Configure the query to insert a relation instead of a regular record
	*/
	relation() {
		return new InsertPromise(this.#connection, {
			...this.#options,
			relation: true
		});
	}
	/**
	* Configure the query to ignore records if they already exist
	*/
	ignore() {
		return new InsertPromise(this.#connection, {
			...this.#options,
			ignore: true
		});
	}
	/**
	* Configure the output of the query
	*/
	output(output) {
		return new InsertPromise(this.#connection, {
			...this.#options,
			output
		});
	}
	/**
	* Configure the timeout of the query
	*/
	timeout(timeout) {
		return new InsertPromise(this.#connection, {
			...this.#options,
			timeout
		});
	}
	/**
	* Configure a custom version of the data being created. This is used
	* alongside version enabled storage engines such as SurrealKV.
	*/
	version(version) {
		return new InsertPromise(this.#connection, {
			...this.#options,
			version
		});
	}
	/**
	* Compile this qurery into a BoundQuery
	*/
	compile() {
		return this.#build().inner;
	}
	/**
	* Stream the results of the query as they are received.
	*
	* @returns An async iterable of query frames.
	*/
	async *stream() {
		await this.#connection.ready();
		const query = this.#build().stream();
		for await (const frame of query) yield frame;
	}
	async dispatch() {
		await this.#connection.ready();
		const [result] = await this.#build().collect();
		return result;
	}
	#build() {
		const { table, what, transaction, session, json, output, timeout, version, relation, ignore } = this.#options;
		const query = surql`INSERT`;
		if (relation) query.append(surql` RELATION`);
		if (ignore) query.append(surql` IGNORE`);
		if (table) query.append(surql` INTO ${table}`);
		query.append(surql` ${what}`);
		if (output) query.append(surql` RETURN ${_output(output)}`);
		if (timeout) query.append(surql` TIMEOUT ${_timeout(timeout)}`);
		if (version) query.append(surql` VERSION ${version}`);
		return new Query(this.#connection, {
			query,
			transaction,
			json,
			session
		});
	}
};
//#endregion
//#region src/query/live.ts
/**
* A promise representing a managed `live` RPC call to the server.
*/
var ManagedLivePromise = class ManagedLivePromise extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options;
	}
	/**
	* Configure the live subscription to return only patches (diffs)
	* instead of the full resource on each update.
	*/
	diff() {
		return new ManagedLivePromise(this.#connection, {
			...this.#options,
			fields: [],
			selection: "diff"
		});
	}
	/**
	* Configure the query to only select the specified field(s)
	*/
	fields(...fields) {
		return new ManagedLivePromise(this.#connection, {
			...this.#options,
			fields,
			selection: "fields"
		});
	}
	/**
	* Configure the query to retrieve the value of the specified field
	*/
	value(field) {
		return new ManagedLivePromise(this.#connection, {
			...this.#options,
			fields: [field],
			selection: "value"
		});
	}
	/**
	* Configure the query to fetch the record only if the condition is met.
	*
	* Expressions can be imported from the `surrealdb` package and combined
	* to compose the desired condition.
	*
	* @see {@link https://github.com/surrealdb/surrealdb.js/blob/main/packages/sdk/src/utils/expr.ts}
	*/
	where(expr) {
		return new ManagedLivePromise(this.#connection, {
			...this.#options,
			cond: expr ? expr : void 0
		});
	}
	/**
	* Configure the query to fetch record link contents for the specified field(s)
	*/
	fetch(...fields) {
		return new ManagedLivePromise(this.#connection, {
			...this.#options,
			fetch: fields
		});
	}
	/**
	* Compile this qurery into a BoundQuery
	*/
	compile() {
		return this.#build().inner;
	}
	async dispatch() {
		await this.#connection.ready();
		this.#connection.assertFeature(Features.LiveQueries);
		return new ManagedLiveSubscription(this.#connection, this.#options.what, this.#options.session, this.#build());
	}
	#build() {
		const { what, selection, fields, cond, fetch, session } = this.#options;
		const query = surql`LIVE SELECT`;
		if (selection === "fields") query.append(surql` type::fields(${fields})`);
		else if (selection === "value") query.append(surql` VALUE type::field(${fields?.[0]})`);
		else if (selection === "diff") query.append(surql` DIFF`);
		else query.append(surql` *`);
		query.append(surql` FROM ${what}`);
		if (cond) query.append(surql` WHERE ${cond}`);
		if (fetch) query.append(surql` FETCH type::fields(${fetch})`);
		return new Query(this.#connection, {
			query,
			transaction: void 0,
			json: false,
			session
		});
	}
};
/**
* A promise representing an unmanaged `live` RPC call to the server.
*/
var UnmanagedLivePromise = class extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options;
	}
	async dispatch() {
		await this.#connection.ready();
		this.#connection.assertFeature(Features.LiveQueries);
		return new UnmanagedLiveSubscription(this.#connection, this.#options.session, this.#options.id);
	}
};
//#endregion
//#region src/query/relate.ts
/**
* A configurable `Promise` for a relate query sent to a SurrealDB instance.
*/
var RelatePromise = class RelatePromise extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options;
	}
	/**
	* Configure the query to return the result as a
	* JSON-compatible structure.
	*
	* This is useful when query results need to be serialized. Keep in mind
	* that your responses will lose SurrealDB type information.
	*/
	json() {
		return new RelatePromise(this.#connection, {
			...this.#options,
			json: true
		});
	}
	/**
	* Configure the query to enforce a unique relationship
	*/
	unique() {
		return new RelatePromise(this.#connection, {
			...this.#options,
			unique: true
		});
	}
	/**
	* Configure the output of the query
	*/
	output(output) {
		return new RelatePromise(this.#connection, {
			...this.#options,
			output
		});
	}
	/**
	* Configure the timeout of the query
	*/
	timeout(timeout) {
		return new RelatePromise(this.#connection, {
			...this.#options,
			timeout
		});
	}
	/**
	* Configure a custom version of the data being created. This is used
	* alongside version enabled storage engines such as SurrealKV.
	*/
	version(version) {
		return new RelatePromise(this.#connection, {
			...this.#options,
			version
		});
	}
	/**
	* Compile this qurery into a BoundQuery
	*/
	compile() {
		return this.#build().inner;
	}
	/**
	* Stream the results of the query as they are received.
	*
	* @returns An async iterable of query frames.
	*/
	async *stream() {
		await this.#connection.ready();
		const query = this.#build().stream();
		for await (const frame of query) yield frame;
	}
	async dispatch() {
		await this.#connection.ready();
		const [result] = await this.#build().collect();
		return result;
	}
	#build() {
		const { from, what, to, data, transaction, session, json, output, timeout, version } = this.#options;
		const isMultiple = Array.isArray(from) || Array.isArray(to);
		if (isMultiple && what instanceof _RecordId) throw new SurrealError("Edge must be a table when creating multiple edges");
		const query = surql`RELATE `;
		if (!isMultiple) query.append(surql` ONLY`);
		query.append(surql` ${from}->${what}->${to}`);
		if (data) query.append(surql` CONTENT ${data}`);
		if (output) query.append(surql` RETURN ${_output(output)}`);
		if (timeout) query.append(surql` TIMEOUT ${_timeout(timeout)}`);
		if (version) query.append(surql` VERSION ${version}`);
		return new Query(this.#connection, {
			query,
			transaction,
			json,
			session
		});
	}
};
//#endregion
//#region src/query/run.ts
const NAME_REGEX = /^[a-zA-Z0-9_:]+$/;
const VERSION_REGEX = /^[0-9.]+$/;
/**
* A configurable `Promise` for a run query sent to a SurrealDB instance.
*/
var RunPromise = class RunPromise extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options;
	}
	/**
	* Configure the query to return the result as a
	* JSON-compatible structure.
	*
	* This is useful when query results need to be serialized. Keep in mind
	* that your responses will lose SurrealDB type information.
	*/
	json() {
		return new RunPromise(this.#connection, {
			...this.#options,
			json: true
		});
	}
	/**
	* Compile this qurery into a BoundQuery
	*/
	compile() {
		return this.#build().inner;
	}
	/**
	* Stream the results of the query as they are received.
	*
	* @returns An async iterable of query frames.
	*/
	async *stream() {
		await this.#connection.ready();
		const query = this.#build().stream();
		for await (const frame of query) yield frame;
	}
	async dispatch() {
		await this.#connection.ready();
		const [result] = await this.#build().collect();
		return result;
	}
	#build() {
		const { name, version, args, transaction, session, json } = this.#options;
		if (!NAME_REGEX.test(name)) throw new ExpressionError("Invalid function name");
		const query = new BoundQuery(name);
		if (version) {
			if (!VERSION_REGEX.test(version)) throw new ExpressionError("Invalid function version");
			query.append(`<${version}>`);
		}
		query.append("(");
		for (const arg of args) query.append(surql`${arg}, `);
		query.append(")");
		return new Query(this.#connection, {
			query,
			transaction,
			json,
			session
		});
	}
};
//#endregion
//#region src/query/select.ts
/**
* A configurable `Promise` for a select query sent to a SurrealDB instance.
*/
var SelectPromise = class SelectPromise extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options;
	}
	/**
	* Configure the query to return the result as a
	* JSON-compatible structure.
	*
	* This is useful when query results need to be serialized. Keep in mind
	* that your responses will lose SurrealDB type information.
	*/
	json() {
		return new SelectPromise(this.#connection, {
			...this.#options,
			json: true
		});
	}
	/**
	* Configure the query to only select the specified field(s)
	*/
	fields(...fields) {
		return new SelectPromise(this.#connection, {
			...this.#options,
			fields,
			selection: "fields"
		});
	}
	/**
	* Configure the query to retrieve the value of the specified field
	*/
	value(field) {
		return new SelectPromise(this.#connection, {
			...this.#options,
			fields: [field],
			selection: "value"
		});
	}
	/**
	* Configure the query to start at the specified index
	*/
	start(start) {
		return new SelectPromise(this.#connection, {
			...this.#options,
			start
		});
	}
	/**
	* Configure the query to limit the number of results
	*/
	limit(limit) {
		return new SelectPromise(this.#connection, {
			...this.#options,
			limit
		});
	}
	/**
	* Configure the query to fetch only records that match the condition.
	*
	* Expressions can be imported from the `surrealdb` package and combined
	* to compose the desired condition.
	*
	* @see {@link https://github.com/surrealdb/surrealdb.js/blob/main/packages/sdk/src/utils/expr.ts}
	*/
	where(expr) {
		return new SelectPromise(this.#connection, {
			...this.#options,
			cond: expr ? expr : void 0
		});
	}
	/**
	* Configure the query to fetch record link contents for the specified field(s)
	*/
	fetch(...fields) {
		return new SelectPromise(this.#connection, {
			...this.#options,
			fetch: fields
		});
	}
	/**
	* Configure the timeout of the query
	*/
	timeout(timeout) {
		return new SelectPromise(this.#connection, {
			...this.#options,
			timeout
		});
	}
	/**
	* Configure a custom version of the data being created. This is used
	* alongside version enabled storage engines such as SurrealKV.
	*/
	version(version) {
		return new SelectPromise(this.#connection, {
			...this.#options,
			version
		});
	}
	/**
	* Compile this qurery into a BoundQuery
	*/
	compile() {
		return this.#build().inner;
	}
	/**
	* Stream the results of the query as they are received.
	*
	* @returns An async iterable of query frames.
	*/
	async *stream() {
		await this.#connection.ready();
		const query = this.#build().stream();
		for await (const frame of query) yield frame;
	}
	async dispatch() {
		await this.#connection.ready();
		const [result] = await this.#build().collect();
		return result;
	}
	#build() {
		const { what, transaction, session, json, selection, fields, start, limit, cond, timeout, version, fetch } = this.#options;
		const query = surql`SELECT`;
		if (selection === "fields") query.append(surql` type::fields(${fields})`);
		else if (selection === "value") query.append(surql` VALUE type::field(${fields?.[0]})`);
		else query.append(surql` *`);
		query.append(surql` FROM ${_only(what)}`);
		if (cond) query.append(surql` WHERE ${cond}`);
		if (start) query.append(surql` START ${start}`);
		if (limit) query.append(surql` LIMIT ${limit}`);
		if (fetch) query.append(surql` FETCH type::fields(${fetch})`);
		if (timeout) query.append(surql` TIMEOUT ${_timeout(timeout)}`);
		if (version) query.append(surql` VERSION ${version}`);
		return new Query(this.#connection, {
			query,
			transaction,
			json,
			session
		});
	}
};
//#endregion
//#region src/query/update.ts
/**
* A configurable `Promise` for an update query sent to a SurrealDB instance.
*/
var UpdatePromise = class UpdatePromise extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options;
	}
	/**
	* Configure the query to return the result as a
	* JSON-compatible structure.
	*
	* This is useful when query results need to be serialized. Keep in mind
	* that your responses will lose SurrealDB type information.
	*/
	json() {
		return new UpdatePromise(this.#connection, {
			...this.#options,
			json: true
		});
	}
	/**
	* Configure the query to set the record data
	*/
	content(data) {
		return new UpdatePromise(this.#connection, {
			...this.#options,
			mutation: "content",
			data
		});
	}
	/**
	* Configure the query to merge the record data
	*/
	merge(data) {
		return new UpdatePromise(this.#connection, {
			...this.#options,
			mutation: "merge",
			data
		});
	}
	/**
	* Configure the query to replace the record data
	*/
	replace(data) {
		return new UpdatePromise(this.#connection, {
			...this.#options,
			mutation: "replace",
			data
		});
	}
	/**
	* Configure the query to patch the record data
	*/
	patch(data) {
		return new UpdatePromise(this.#connection, {
			...this.#options,
			mutation: "patch",
			data
		});
	}
	/**
	* Configure the query to update the record only if the condition is met.
	*
	* Expressions can be imported from the `surrealdb` package and combined
	* to compose the desired condition.
	*
	* @see {@link https://github.com/surrealdb/surrealdb.js/blob/main/packages/sdk/src/utils/expr.ts}
	*/
	where(expr) {
		return new UpdatePromise(this.#connection, {
			...this.#options,
			cond: expr ? expr : void 0
		});
	}
	/**
	* Configure the output of the query
	*/
	output(output) {
		return new UpdatePromise(this.#connection, {
			...this.#options,
			output
		});
	}
	/**
	* Configure the timeout of the query
	*/
	timeout(timeout) {
		return new UpdatePromise(this.#connection, {
			...this.#options,
			timeout
		});
	}
	/**
	* Compile this qurery into a BoundQuery
	*/
	compile() {
		return this.#build().inner;
	}
	/**
	* Stream the results of the query as they are received.
	*
	* @returns An async iterable of query frames.
	*/
	async *stream() {
		await this.#connection.ready();
		const query = this.#build().stream();
		for await (const frame of query) yield frame;
	}
	async dispatch() {
		await this.#connection.ready();
		const [result] = await this.#build().collect();
		return result;
	}
	#build() {
		const { what, data, transaction, session, json, cond, output, timeout, mutation } = this.#options;
		const query = surql`UPDATE ${_only(what)}`;
		if (mutation && data) query.append(surql` ${raw(mutation.toUpperCase())} ${data}`);
		if (cond) query.append(surql` WHERE ${cond}`);
		if (output) query.append(surql` RETURN ${_output(output)}`);
		if (timeout) query.append(surql` TIMEOUT ${_timeout(timeout)}`);
		return new Query(this.#connection, {
			query,
			transaction,
			json,
			session
		});
	}
};
//#endregion
//#region src/query/upsert.ts
/**
* A configurable `Promise` for an upsert query sent to a SurrealDB instance.
*/
var UpsertPromise = class UpsertPromise extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options;
	}
	/**
	* Configure the query to return the result as a
	* JSON-compatible structure.
	*
	* This is useful when query results need to be serialized. Keep in mind
	* that your responses will lose SurrealDB type information.
	*/
	json() {
		return new UpsertPromise(this.#connection, {
			...this.#options,
			json: true
		});
	}
	/**
	* Configure the query to set the record data
	*/
	content(data) {
		return new UpsertPromise(this.#connection, {
			...this.#options,
			mutation: "content",
			data
		});
	}
	/**
	* Configure the query to merge the record data
	*/
	merge(data) {
		return new UpsertPromise(this.#connection, {
			...this.#options,
			mutation: "merge",
			data
		});
	}
	/**
	* Configure the query to replace the record data
	*/
	replace(data) {
		return new UpsertPromise(this.#connection, {
			...this.#options,
			mutation: "replace",
			data
		});
	}
	/**
	* Configure the query to patch the record data
	*/
	patch(data) {
		return new UpsertPromise(this.#connection, {
			...this.#options,
			mutation: "patch",
			data
		});
	}
	/**
	* Configure the query to upsert the record only if the condition is met.
	*
	* Expressions can be imported from the `surrealdb` package and combined
	* to compose the desired condition.
	*
	* @see {@link https://github.com/surrealdb/surrealdb.js/blob/main/packages/sdk/src/utils/expr.ts}
	*/
	where(expr) {
		return new UpsertPromise(this.#connection, {
			...this.#options,
			cond: expr ? expr : void 0
		});
	}
	/**
	* Configure the output of the query
	*/
	output(output) {
		return new UpsertPromise(this.#connection, {
			...this.#options,
			output
		});
	}
	/**
	* Configure the timeout of the query
	*/
	timeout(timeout) {
		return new UpsertPromise(this.#connection, {
			...this.#options,
			timeout
		});
	}
	/**
	* Compile this qurery into a BoundQuery
	*/
	compile() {
		return this.#build().inner;
	}
	/**
	* Stream the results of the query as they are received.
	*
	* @returns An async iterable of query frames.
	*/
	async *stream() {
		await this.#connection.ready();
		const query = this.#build().stream();
		for await (const frame of query) yield frame;
	}
	async dispatch() {
		await this.#connection.ready();
		const [result] = await this.#build().collect();
		return result;
	}
	#build() {
		const { what, data, transaction, session, json, cond, output, timeout, mutation } = this.#options;
		const query = surql`UPSERT ${_only(what)}`;
		if (mutation && data) query.append(surql` ${raw(mutation.toUpperCase())} ${data}`);
		if (cond) query.append(surql` WHERE ${cond}`);
		if (output) query.append(surql` RETURN ${_output(output)}`);
		if (timeout) query.append(surql` TIMEOUT ${_timeout(timeout)}`);
		return new Query(this.#connection, {
			query,
			transaction,
			json,
			session
		});
	}
};
//#endregion
//#region src/utils/live.ts
function newKill(id) {
	return new BoundQuery(`KILL u"${id.toString()}"`);
}
/**
* Represents a subscription to a LIVE SELECT query
*/
var LiveSubscription = class {
	/**
	* Subscribe to the live subscription and return an unsubscribe function
	*/
	subscribe(handler) {
		let killed = false;
		(async () => {
			for await (const message of this) {
				if (killed) return;
				handler(message);
			}
		})();
		return () => {
			killed = true;
		};
	}
};
/**
* A managed live subscription that is automatically restarted when the connection
* is re-established.
*/
var ManagedLiveSubscription = class extends LiveSubscription {
	#currentId;
	#controller;
	#resource;
	#session;
	#query;
	#killed = false;
	#channels = /* @__PURE__ */ new Set();
	#unsubscribe;
	constructor(controller, resource, session, query) {
		super();
		this.#controller = controller;
		this.#resource = resource;
		this.#session = session;
		this.#query = query;
		this.#unsubscribe = this.#controller.subscribe("connected", () => {
			this.#listen();
		});
		if (this.#controller.status === "connected") this.#listen();
	}
	get id() {
		return this.#currentId;
	}
	get isManaged() {
		return true;
	}
	get resource() {
		return this.#resource;
	}
	get isAlive() {
		return !this.#killed;
	}
	async kill() {
		this.#killed = true;
		for (const channel of this.#channels) channel.cancel();
		this.#unsubscribe();
		if (this.id) await new Query(this.#controller, {
			query: newKill(this.id),
			transaction: void 0,
			session: this.#session,
			json: false
		});
	}
	[Symbol.asyncIterator]() {
		if (this.#killed) throw new LiveSubscriptionError("Subscription has been killed");
		const channel = new ChannelIterator(() => {
			this.#channels.delete(channel);
		});
		this.#channels.add(channel);
		return channel;
	}
	async #listen() {
		try {
			const [id] = await this.#query.collect();
			this.#currentId = id;
			const messageStream = this.#controller.liveQuery(id);
			for await (const message of messageStream) for (const channel of this.#channels) channel.submit(message);
		} catch (err) {
			this.#controller.propagateError(new LiveSubscriptionError(err));
		}
	}
};
/**
* An unmanaged live subscription which is constructed with only
* a known pre-existing ID. This subscription will not be automatically
* restarted when the connection is re-established.
*/
var UnmanagedLiveSubscription = class extends LiveSubscription {
	#id;
	#controller;
	#session;
	#killed = false;
	#channels = /* @__PURE__ */ new Set();
	constructor(controller, session, id) {
		super();
		this.#controller = controller;
		this.#session = session;
		this.#id = id;
		if (this.#controller.status !== "connected") throw new ConnectionUnavailableError();
		(async () => {
			const messageStream = controller.liveQuery(id);
			for await (const message of messageStream) for (const channel of this.#channels) channel.submit(message);
			for (const channel of this.#channels) channel.cancel();
		})();
	}
	get id() {
		return this.#id;
	}
	get isManaged() {
		return false;
	}
	get resource() {}
	get isAlive() {
		return !this.#killed;
	}
	async kill() {
		this.#killed = true;
		for (const channel of this.#channels) channel.cancel();
		if (this.id) await new Query(this.#controller, {
			query: newKill(this.id),
			transaction: void 0,
			session: this.#session,
			json: false
		});
	}
	[Symbol.asyncIterator]() {
		if (this.#killed) throw new LiveSubscriptionError("Subscription has been killed");
		const channel = new ChannelIterator(() => {
			this.#channels.delete(channel);
		});
		this.#channels.add(channel);
		return channel;
	}
};
//#endregion
//#region src/utils/publisher.ts
var Publisher = class {
	#subscriptions = {};
	subscribe(event, listener) {
		this.#subscriptions[event] ??= /* @__PURE__ */ new Set();
		this.#subscriptions[event]?.add(listener);
		return () => {
			const subscriptions = this.#subscriptions[event];
			if (subscriptions?.delete(listener) && subscriptions.size === 0) delete this.#subscriptions[event];
		};
	}
	subscribeFirst(...events) {
		const subscriptions = [];
		return new Promise((resolve) => {
			for (const event of events) {
				const unsubscribe = this.subscribe(event, (...payload) => {
					for (const subscription of subscriptions) subscription();
					resolve(payload);
				});
				subscriptions.push(unsubscribe);
			}
		});
	}
	publish(event, ...payload) {
		const subscriptions = this.#subscriptions[event];
		if (!subscriptions) return;
		const failures = [];
		for (const subscription of subscriptions) try {
			subscription(...payload);
		} catch (cause) {
			failures.push(cause);
		}
		if (failures.length > 0) throw new PublishError(failures);
	}
};
//#endregion
//#region src/utils/string-prefixes.ts
/**
* A template literal tag function for parsing a string type.
*
* @param string The string to parse
* @param values The interpolated values
* @returns The parsed string
*/
function s(string, ...values) {
	return string.reduce((prev, curr, i) => `${prev}${curr}${values[i] ?? ""}`, "");
}
/**
* A template literal tag function for parsing a string into a Date.
*
* @param string The string to parse
* @param values The interpolated values
* @returns The parsed Date
*/
function d(string, ...values) {
	return new DateTime(s(string, values));
}
/**
* A template literal tag function for parsing a string into a StringRecordId.
*
* @param string The string to parse
* @param values The interpolated values
* @returns The parsed StringRecordId
*/
function r(string, ...values) {
	return new StringRecordId(s(string, values));
}
/**
* A template literal tag function for parsing a string into a Uuid.
*
* @param string The string to parse
* @param values The interpolated values
* @returns The parsed Uuid
*/
function u(string, ...values) {
	return new Uuid(s(string, values));
}
//#endregion
//#region src/query/api.ts
/**
* A configurable `Promise` for an api request sent to a SurrealDB instance.
*/
var ApiPromise = class ApiPromise extends DispatchedPromise {
	#connection;
	#options;
	constructor(connection, options) {
		super();
		this.#connection = connection;
		this.#options = options;
	}
	/**
	* Configure the query to return the result as a
	* JSON-compatible structure.
	*
	* This is useful when query results need to be serialized. Keep in mind
	* that your responses will lose SurrealDB type information.
	*/
	json() {
		return new ApiPromise(this.#connection, {
			...this.#options,
			json: true
		});
	}
	/**
	* Append a header to the api request.
	*
	* @param name The name of the header to append.
	* @param value The value of the header to append.
	*/
	header(name, value) {
		return new ApiPromise(this.#connection, {
			...this.#options,
			headers: {
				...this.#options.headers,
				[name]: value
			}
		});
	}
	/**
	* Append a query parameter to the api request.
	*
	* @param name The name of the query parameter to append.
	* @param value The value of the query parameter to append.
	* @returns A new ApiPromise instance.
	*/
	query(name, value) {
		return new ApiPromise(this.#connection, {
			...this.#options,
			query: {
				...this.#options.query,
				[name]: value
			}
		});
	}
	/**
	* Configure the query to return the response body value
	* as the result. If the response status is not 200, the promise will reject.
	*/
	value() {
		return new ApiPromise(this.#connection, {
			...this.#options,
			value: true
		});
	}
	/**
	* Compile this qurery into a BoundQuery
	*/
	compile() {
		return this.#build().inner;
	}
	/**
	* Stream the results of the query as they are received.
	*
	* @returns An async iterable of query frames.
	*/
	async *stream() {
		await this.#connection.ready();
		const query = this.#build().stream();
		for await (const frame of query) yield frame;
	}
	async dispatch() {
		await this.#connection.ready();
		const [result] = await this.#build().collect();
		if (!("body" in result) || typeof result.status !== "number") throw new SurrealError("Body or status was missing from the API response");
		if (this.#options.value) {
			if ("status" in result && !isSuccessful(result.status)) throw new UnsuccessfulApiError(this.#options.path, this.#options.method, result);
			return result.body;
		}
		return result;
	}
	#build() {
		const { path, body, method, headers, query, transaction, session, json } = this.#options;
		return new Query(this.#connection, {
			transaction,
			json,
			session,
			query: surql`api::invoke(${path}, ${{
				body,
				method,
				headers,
				query
			}})`
		});
	}
};
function isSuccessful(status) {
	return status >= 200 && status < 300;
}
//#endregion
//#region src/api/api.ts
/**
* Exposes a set of methods to interact with user defined APIs.
*
* @example
* ```ts
* type MyPaths = {
*     "/users": { get: [void, User[]] };
*     "/projects": { get: [void, Project[]] };
*     [K: `/users/${number}`]: { get: [void, User] };
* };
*
* const api = db.api<MyPaths>();
* api.get("/users");  // Returns ApiPromise<void, User[]>
* ```
*/
var SurrealApi = class {
	#connection;
	#transaction;
	#prefix;
	#session;
	#headers;
	constructor(connection, session, transaction, prefix) {
		this.#connection = connection;
		this.#session = session;
		this.#transaction = transaction;
		this.#prefix = prefix ?? "";
		this.#headers = {};
	}
	/**
	* Configure a header for all requests sent by this API instance.
	*
	* This is useful for setting a common header for all requests sent by this API instance.
	*
	* @param name The name of the header to configure.
	* @param value The value of the header to configure, or null to remove the header.
	*/
	header(name, value) {
		if (value === null) delete this.#headers[name];
		else this.#headers[name] = value;
	}
	/**
	* Invoke a user defined API initialized with a request object.
	*
	* Prefer the method specific functions for a more type-safe experience.
	*
	* @param path The path of the API to invoke.
	* @param request The request to send to the API.
	* @returns The response from the API.
	*/
	invoke(path, request) {
		this.#connection.assertFeature(Features.Api);
		return new ApiPromise(this.#connection, {
			path: normalizePath(this.#prefix, path),
			transaction: this.#transaction,
			session: this.#session,
			value: false,
			json: false,
			headers: {
				...this.#headers,
				...request?.headers
			},
			query: request?.query ?? {},
			method: request?.method ?? "get",
			body: request?.body
		});
	}
	/**
	* Invoke a user defined GET API.
	*
	* @param path The path of the API to invoke.
	* @returns The response from the API.
	*/
	get(path) {
		return this.invoke(path, { method: "get" });
	}
	/**
	* Invoke a user defined POST API.
	*
	* @param path The path of the API to invoke.
	* @param body The request body to send to the API.
	* @returns The response from the API.
	*/
	post(path, body) {
		return this.invoke(path, {
			method: "post",
			body
		});
	}
	/**
	* Invoke a user defined PUT API.
	*
	* @param path The path of the API to invoke.
	* @param body The request body to send to the API.
	* @returns The response from the API.
	*/
	put(path, body) {
		return this.invoke(path, {
			method: "put",
			body
		});
	}
	/**
	* Invoke a user defined DELETE API.
	*
	* @param path The path of the API to invoke.
	* @param body The request body to send to the API.
	* @returns The response from the API.
	*/
	delete(path, body) {
		return this.invoke(path, {
			method: "delete",
			body
		});
	}
	/**
	* Invoke a user defined PATCH API.
	*
	* @param path The path of the API to invoke.
	* @param body The request body to send to the API.
	* @returns The response from the API.
	*/
	patch(path, body) {
		return this.invoke(path, {
			method: "patch",
			body
		});
	}
	/**
	* Invoke a user defined TRACE API.
	*
	* @param path The path of the API to invoke.
	* @param body The request body to send to the API.
	* @returns The response from the API.
	*/
	trace(path, body) {
		return this.invoke(path, {
			method: "trace",
			body
		});
	}
};
//#endregion
//#region src/api/export.ts
/**
* A configurable `Promise` for export operations.
*/
var ExportPromise = class ExportPromise extends DispatchedPromise {
	#connection;
	#options;
	#raw;
	constructor(connection, options, raw) {
		super();
		this.#connection = connection;
		this.#options = options;
		this.#raw = raw;
	}
	/**
	* Configure the export to return the raw `Response` instead of
	* a SurrealQL string. This is useful when you may receive a
	* large amount of data and need to handle the response stream
	* directly.
	*/
	raw() {
		return new ExportPromise(this.#connection, this.#options, true);
	}
	async dispatch() {
		await this.#connection.ready();
		if (this.#raw) this.#connection.assertFeature(Features.ExportImportRaw);
		const result = await this.#connection.exportSql(this.#options);
		if (this.#raw) return result;
		if (typeof result === "string") return result;
		return await result.text();
	}
};
/**
* A configurable `Promise` for model export operations.
*/
var ExportModelPromise = class ExportModelPromise extends DispatchedPromise {
	#connection;
	#options;
	#raw;
	constructor(connection, options, raw) {
		super();
		this.#connection = connection;
		this.#options = options;
		this.#raw = raw;
	}
	/**
	* Configure the export to return the raw `Response` instead of
	* a `Uint8Array`. This is useful when you may receive a large
	* amount of data and need to handle the response stream directly.
	*/
	raw() {
		return new ExportModelPromise(this.#connection, this.#options, true);
	}
	async dispatch() {
		await this.#connection.ready();
		this.#connection.assertFeature(Features.SurrealML);
		if (this.#raw) this.#connection.assertFeature(Features.ExportImportRaw);
		const result = await this.#connection.exportMlModel(this.#options);
		if (this.#raw) return result;
		if (result instanceof Uint8Array) return result;
		return new Uint8Array(await result.arrayBuffer());
	}
};
//#endregion
//#region src/api/queryable.ts
/**
* Represents a scope capable of executing SurrealDB queries.
*/
var SurrealQueryable = class {
	#connection;
	#transaction;
	#session;
	constructor(connection, session, transaction) {
		this.#connection = connection;
		this.#session = session;
		this.#transaction = transaction;
	}
	/**
	* Access user defined APIs defined on the database.
	*
	* Path types can be passed to this method in order to
	* provide type safety when invoking APIs.
	*
	* An optional prefix can be provided to prepend to API paths.
	*
	* @example
	* ```ts
	* type MyPaths = {
	*     "/users": { get: [void, User[]] };
	*     [K: `/users/${number}`]: { get: [void, User] };
	* };
	*
	* // Type-safe path and response
	* const api = db.api<MyPaths>();
	* api.get("/users"); // User[]
	*
	* // Prefix to invoke GET /users/:id
	* const usersApi = db.api<MyPaths>("/users");
	* api.get(userId); // User
	* ```
	*
	* @param prefix An optional path prefix to prepend to API paths.
	* @returns A new `SurrealApi` instance.
	*/
	api(prefix) {
		return new SurrealApi(this.#connection, this.#session, this.#transaction, prefix);
	}
	query(query, bindings) {
		return new Query(this.#connection, {
			query: query instanceof BoundQuery ? query : new BoundQuery(query, bindings),
			transaction: this.#transaction,
			session: this.#session,
			json: false
		});
	}
	/**
	* Returns the record representing the currently authenticated record user by
	* selecting the [$auth parameter](https://surrealdb.com/docs/surrealql/parameters#auth).
	*
	* Make sure the user actually has the permission to select their own record, otherwise you'll get back an empty result
	*
	* @return The record linked to the record ID used for authentication
	*/
	auth() {
		return new AuthPromise(this.#connection, {
			transaction: this.#transaction,
			session: this.#session,
			json: false
		});
	}
	/**
	* Create a new live subscription to a specific table, record id, or record id range
	*
	* @param what The table to subscribe to
	* @returns A new live subscription object
	*/
	live(what) {
		return new ManagedLivePromise(this.#connection, {
			what,
			session: this.#session
		});
	}
	/**
	* Manually subscribe to an existing live subscription using the provided ID
	*
	* **NOTE:** This function is for use with live select queries that are not managed by the driver.
	*
	* @param id The ID of the live subscription to subscribe to
	* @returns A new unmanaged live subscription object
	*/
	liveOf(id) {
		return new UnmanagedLivePromise(this.#connection, {
			id,
			session: this.#session
		});
	}
	select(what) {
		return new SelectPromise(this.#connection, {
			what,
			transaction: this.#transaction,
			session: this.#session,
			json: false
		});
	}
	create(what) {
		return new CreatePromise(this.#connection, {
			what,
			transaction: this.#transaction,
			session: this.#session,
			json: false
		});
	}
	relate(from, what, to, data) {
		return new RelatePromise(this.#connection, {
			from,
			what,
			to,
			data,
			transaction: this.#transaction,
			session: this.#session,
			json: false
		});
	}
	insert(arg1, arg2) {
		if (arg1 instanceof Table) return new InsertPromise(this.#connection, {
			table: arg1,
			what: arg2 ?? [],
			transaction: this.#transaction,
			session: this.#session,
			json: false
		});
		return new InsertPromise(this.#connection, {
			table: void 0,
			what: arg1,
			transaction: this.#transaction,
			session: this.#session,
			json: false
		});
	}
	update(what) {
		return new UpdatePromise(this.#connection, {
			what,
			transaction: this.#transaction,
			session: this.#session,
			json: false
		});
	}
	upsert(what) {
		return new UpsertPromise(this.#connection, {
			what,
			transaction: this.#transaction,
			session: this.#session,
			json: false
		});
	}
	delete(what) {
		return new DeletePromise(this.#connection, {
			what,
			output: "before",
			transaction: this.#transaction,
			session: this.#session,
			json: false
		});
	}
	run(name, arg2, arg3) {
		if (typeof arg2 === "string") return new RunPromise(this.#connection, {
			name,
			version: arg2,
			args: arg3 ?? [],
			transaction: this.#transaction,
			session: this.#session,
			json: false
		});
		return new RunPromise(this.#connection, {
			name,
			version: void 0,
			args: arg2 ?? [],
			transaction: this.#transaction,
			session: this.#session,
			json: false
		});
	}
};
//#endregion
//#region src/api/transaction.ts
/**
* A query transaction scoped to a session used to execute multiple queries atomically.
*
* When the desired queries have been executed, call `commit()` to apply the changes to the database.
* If the transaction is no longer needed, call `cancel()` to discard the changes.
*/
var SurrealTransaction = class extends SurrealQueryable {
	#connection;
	#session;
	#transaction;
	constructor(connection, session, transaction) {
		super(connection, session, transaction);
		this.#connection = connection;
		this.#session = session;
		this.#transaction = transaction;
	}
	/**
	* Commit this transaction to the datastore.
	*/
	commit() {
		if (!this.#connection) throw new ConnectionUnavailableError();
		return this.#connection.commit(this.#transaction, this.#session);
	}
	/**
	* Cancel and discard the changes made in this transaction.
	*/
	cancel() {
		if (!this.#connection) throw new ConnectionUnavailableError();
		return this.#connection.cancel(this.#transaction, this.#session);
	}
};
//#endregion
//#region src/api/session.ts
/**
* A scoped contextual session attached to a connection to SurrealDB.
*
* Note that most methods in this class are dispatched once you subscribe to the
* returned Promise and offer various chainable configuration methods before
* making the actual request.
*
* You can create a new derived session by calling the `forkSession` method.
*/
var SurrealSession = class SurrealSession extends SurrealQueryable {
	#publisher = new Publisher();
	#connection;
	#session;
	#unsubAuth;
	#unsubUsing;
	subscribe(event, listener) {
		return this.#publisher.subscribe(event, listener);
	}
	constructor(connection, session) {
		super(connection, session);
		this.#connection = connection;
		this.#session = session;
		this.#unsubAuth = connection.subscribe("auth", (auth, session) => {
			if (session === this.#session) this.#publisher.publish("auth", auth);
		});
		this.#unsubUsing = connection.subscribe("using", (using, session) => {
			if (session === this.#session) this.#publisher.publish("using", using);
		});
	}
	/**
	* Returns the selected namespace
	*/
	get namespace() {
		return this.#connection.getSession(this.#session).namespace;
	}
	/**
	* Returns the selected database
	*/
	get database() {
		return this.#connection.getSession(this.#session).database;
	}
	/**
	* Returns the current authentication access token
	*/
	get accessToken() {
		return this.#connection.getSession(this.#session).accessToken;
	}
	/**
	* Returns the parameters currently defined on the session
	*/
	get parameters() {
		return this.#connection.getSession(this.#session).variables ?? {};
	}
	/**
	* Returns the ID of the current session. For the default session, undefined is returned.
	*/
	get session() {
		return this.#session;
	}
	/**
	* Returns whether the session is valid and can be used. This is always true for the default session,
	* however for other sessions it will be false after the session has been disposed.
	*/
	get isValid() {
		return this.#connection.hasSession(this.#session);
	}
	/**
	* Create a new session by cloning the current session and return a new `SurrealSession` instance scoped to it.
	*
	* This session will contain its own copy of global variables, namespace, database, and authentication state.
	* Connection related functions and event subscriptions will be shared with the original session. When the
	* connection reconnects, the session will be automatically restored.
	*
	* You can invoke `reset()` on the created session to destroy it, after which it cannot be used again.
	*
	* The following properties are inherited by the new session:
	* - namespace
	* - database
	* - variables
	* - authentication state
	*
	* @returns The new session
	*/
	async forkSession() {
		const created = await this.#connection.createSession(this.#session);
		return SurrealSession.of(this, created);
	}
	/**
	* Closes the current session and disposes of it. After this method is called, the session cannot be used again,
	* and `isValid` will return `false`.
	*/
	async closeSession() {
		await this.#connection.destroySession(this.#session);
		this.#unsubAuth();
		this.#unsubUsing();
	}
	[Symbol.asyncDispose]() {
		return this.closeSession();
	}
	/**
	* Create a new transaction scoped to the current session. Transactions allow you to execute
	* multiple queries atomically. When the desired queries have been executed, call `commit()` to apply the changes to the database.
	* If the transaction is no longer needed, call `cancel()` to discard the changes.
	*
	* @returns A new transaction instance
	*/
	async beginTransaction() {
		const transactionId = await this.#connection.begin(this.#session);
		return new SurrealTransaction(this.#connection, this.#session, transactionId);
	}
	/**
	* Switch to the specified {@link https://surrealdb.com/docs/surrealdb/introduction/concepts/namespace|namespace}
	* and {@link https://surrealdb.com/docs/surrealdb/introduction/concepts/database|database}
	*
	* Leaving the namespace or database undefined will leave the current namespace or database unchanged,
	* while passing null will unset the selected namespace or database.
	*
	* @param database Switches to a specific namespace
	* @param db Switches to a specific database
	* @returns The newly selected namespace and database
	*/
	async use(what) {
		return await this.#connection.use(what ?? {}, this.#session);
	}
	/**
	* Sign up to the SurrealDB instance as a new
	* {@link https://surrealdb.com/docs/surrealdb/security/authentication#record-users|record user}.
	*
	* When this method is called, the `authentication` property passed to `connect()`
	* will be ignored. You will be reponsible for handling session invalidation
	* by listening to the `auth` event.
	*
	* @param auth The authentication details to use.
	* @return The authentication tokens.
	*/
	signup(auth) {
		return this.#connection.signup(auth, this.#session);
	}
	/**
	* Authenticate with the SurrealDB using the provided authentication details.
	*
	* When this method is called, the `authentication` property passed to `connect()`
	* will be ignored. You will be reponsible for handling session invalidation
	* by listening to the `auth` event.
	*
	* @param auth The authentication details to use.
	* @return The authentication tokens.
	*/
	signin(auth) {
		return this.#connection.signin(auth, this.#session);
	}
	/**
	* Authenticates the current connection using an existing access token or
	* an access and refresh token combination.
	*
	* When authenticating with a refresh token, a new refresh token will be issued
	* and returned.
	*
	* When this method is called, the `authentication` property passed to `connect()`
	* will be ignored. You will be reponsible for handling session invalidation
	* by listening to the `auth` event.
	*
	* @param token The access token or access and refresh token combination.
	*/
	async authenticate(token) {
		if (typeof token === "object" && token.refresh) return this.#connection.refresh(token, this.#session);
		const access = typeof token === "string" ? token : token.access;
		await this.#connection.authenticate(access, this.#session);
		return { access };
	}
	/**
	* Define a global variable for the current socket connection
	*
	* @param key Specifies the name of the variable
	* @param val Assigns the value to the variable name
	*/
	set(variable, value) {
		return this.#connection.set(variable, value, this.#session);
	}
	/**
	* Remove a variable from the current socket connection
	*
	* @param key Specifies the name of the variable.
	*/
	unset(variable) {
		return this.#connection.unset(variable, this.#session);
	}
	/**
	* Invalidates the authentication for the current connection.
	*/
	invalidate() {
		return this.#connection.invalidate(this.#session);
	}
	/**
	* Resets the current session to its initial state, clearing
	* authentication state, variables, and selected namespace/database.
	*/
	async reset() {
		await this.#connection.reset(this.#session);
	}
	/**
	* Compose a new `SurrealSession` instance with the provided parent connection
	* and session ID.
	*
	* You likely won't need to use this method directly, but it can be useful when
	* you need to compose a new `SurrealSession` instance from an id.
	*
	* @param session The parent connection or session to reference
	* @param id The ID of the session
	* @returns A new `SurrealSession` representing the provided ID
	*/
	static of(parent, id) {
		return new SurrealSession(parent.#connection, id);
	}
}, POW_2_64 = BigInt(0x10000000000000000);
var Encoded = class {
	constructor(encoded) {
		this.encoded = encoded;
	}
};
var CborError = class {
	message;
	constructor(message) {
		this.message = message;
	}
}, CborNumberError = class extends CborError {
	name = "CborNumberError";
}, CborRangeError = class extends CborError {
	name = "CborRangeError";
}, CborInvalidMajorError = class extends CborError {
	name = "CborInvalidMajorError";
}, CborBreak = class extends CborError {
	name = "CborBreak";
	constructor() {
		super("Came across a break which was not intercepted by the decoder");
	}
}, CborPartialDisabled = class extends CborError {
	name = "CborPartialDisabled";
	constructor() {
		super("Tried to insert a Gap into a CBOR value, while partial mode is not enabled");
	}
}, CborFillMissing = class extends CborError {
	name = "CborFillMissing";
	constructor() {
		super("Fill for a gap is missing, and gap has no default");
	}
};
var Gap = class {
	args = [];
	constructor(...args) {
		this.args = args;
	}
	fill(value) {
		return [this, value];
	}
	hasDefault() {
		return this.args.length === 1;
	}
	get default() {
		return this.args[0];
	}
};
var Writer = class {
	constructor(byteLength = 256) {
		this.byteLength = byteLength;
		this._buf = new ArrayBuffer(this.byteLength), this._view = new DataView(this._buf), this._byte = new Uint8Array(this._buf);
	}
	_chunks = [];
	_pos = 0;
	_buf;
	_view;
	_byte;
	chunk(gap) {
		this._chunks.push([this._byte.subarray(0, this._pos), gap]), this._buf = new ArrayBuffer(this.byteLength), this._view = new DataView(this._buf), this._byte = new Uint8Array(this._buf), this._pos = 0;
	}
	get chunks() {
		return this._chunks;
	}
	get buffer() {
		return this._byte.subarray(0, this._pos);
	}
	claim(length) {
		let pos = this._pos;
		if (this._pos += length, this._pos <= this._buf.byteLength) return pos;
		let newLen = this._buf.byteLength << 1;
		for (; newLen < this._pos;) newLen <<= 1;
		let oldb = this._byte;
		return this._buf = new ArrayBuffer(newLen), this._view = new DataView(this._buf), this._byte = new Uint8Array(this._buf), this._byte.set(oldb), pos;
	}
	writeUint8(value) {
		let pos = this.claim(1);
		this._byte[pos] = value;
	}
	writeUint16(value) {
		let pos = this.claim(2);
		this._view.setUint16(pos, value, !1);
	}
	writeUint32(value) {
		let pos = this.claim(4);
		this._view.setUint32(pos, value, !1);
	}
	writeUint64(value) {
		let pos = this.claim(8);
		this._view.setBigUint64(pos, value, !1);
	}
	writeFloat32(value) {
		let pos = this.claim(4);
		this._view.setFloat32(pos, value, !1);
	}
	writeFloat64(value) {
		let pos = this.claim(8);
		this._view.setFloat64(pos, value, !1);
	}
	writeUint8Array(data) {
		if (data.byteLength === 0) return;
		let pos = this.claim(data.byteLength);
		this._byte.set(data, pos);
	}
	writePartiallyEncoded(data) {
		for (let [buf, gap] of data.chunks) this.writeUint8Array(buf), this.chunk(gap);
		this.writeUint8Array(data.end);
	}
	writeMajor(type, length) {
		let base = type << 5;
		typeof length == "number" ? length < 24 ? this.writeUint8(base + length) : length < 256 ? (this.writeUint8(base + 24), this.writeUint8(length)) : length < 65536 ? (this.writeUint8(base + 25), this.writeUint16(length)) : length < 4294967296 ? (this.writeUint8(base + 26), this.writeUint32(length)) : (this.writeUint8(base + 27), this.writeUint64(BigInt(length))) : length < 24n ? this.writeUint8(base + Number(length)) : length < 256n ? (this.writeUint8(base + 24), this.writeUint8(Number(length))) : length < 65536n ? (this.writeUint8(base + 25), this.writeUint16(Number(length))) : length < 4294967296n ? (this.writeUint8(base + 26), this.writeUint32(Number(length))) : (this.writeUint8(base + 27), this.writeUint64(length));
	}
	output(partial = !1, replacer) {
		return partial ? new PartiallyEncoded(this._chunks, this.buffer, replacer) : this.buffer;
	}
};
var PartiallyEncoded = class {
	constructor(chunks, end, replacer) {
		this.chunks = chunks;
		this.end = end;
		this.replacer = replacer;
	}
	build(fills, partial) {
		let writer = new Writer(), map = new Map(fills);
		for (let [buffer, gap] of this.chunks) {
			let hasValue = map.has(gap) || gap.hasDefault();
			if (!partial && !hasValue) throw new CborFillMissing();
			if (writer.writeUint8Array(buffer), hasValue) encode(map.get(gap) ?? gap.default, {
				writer,
				replacer: this.replacer
			});
			else writer.chunk(gap);
		}
		return writer.writeUint8Array(this.end), partial ? writer.output(!0, this.replacer) : writer.output(!1, this.replacer);
	}
};
var Tagged = class {
	constructor(tag, value) {
		this.tag = tag;
		this.value = value;
	}
};
var textEncoder = new TextEncoder();
function encode(input, options = {}) {
	let w = options.writer ?? new Writer(), fillsMap = new Map(options.fills ?? []);
	function inner(input2) {
		if (input2 = options.replacer?.(input2) ?? input2, input2 === void 0) return w.writeUint8(247);
		if (input2 === null) return w.writeUint8(246);
		if (input2 === !0) return w.writeUint8(245);
		if (input2 === !1) return w.writeUint8(244);
		switch (typeof input2) {
			case "number":
				if (Number.isInteger(input2)) if (input2 >= 0 && input2 <= 9007199254740992) w.writeMajor(0, input2);
				else if (input2 < 0 && input2 >= -9007199254740992) w.writeMajor(1, -(input2 + 1));
				else throw new CborNumberError("Number too big to be encoded");
				else w.writeUint8(251), w.writeFloat64(input2);
				return;
			case "bigint":
				if (input2 >= 0 && input2 < POW_2_64) w.writeMajor(0, input2);
				else if (input2 <= 0 && input2 >= -POW_2_64) w.writeMajor(1, -(input2 + 1n));
				else throw new CborNumberError("BigInt too big to be encoded");
				return;
			case "string": {
				let encoded = textEncoder.encode(input2);
				w.writeMajor(3, encoded.byteLength), w.writeUint8Array(encoded);
				return;
			}
			default:
				if (Array.isArray(input2)) {
					w.writeMajor(4, input2.length);
					for (let v of input2) inner(v);
					return;
				}
				if (input2 instanceof Tagged) {
					w.writeMajor(6, input2.tag), inner(input2.value);
					return;
				}
				if (input2 instanceof Encoded) {
					w.writeUint8Array(input2.encoded);
					return;
				}
				if (input2 instanceof Gap) {
					if (fillsMap.has(input2)) inner(fillsMap.get(input2));
					else if (options.partial) w.chunk(input2);
					else throw new CborPartialDisabled();
					return;
				}
				if (input2 instanceof PartiallyEncoded) {
					let res = options.partial ? input2.build(options.fills ?? [], !0) : input2.build(options.fills ?? [], !1);
					res instanceof PartiallyEncoded ? w.writePartiallyEncoded(res) : w.writeUint8Array(res);
					return;
				}
				if (input2 instanceof Uint8Array || input2 instanceof Uint16Array || input2 instanceof Uint32Array || input2 instanceof Int8Array || input2 instanceof Int16Array || input2 instanceof Int32Array || input2 instanceof Float32Array || input2 instanceof Float64Array || input2 instanceof ArrayBuffer) {
					let v = input2 instanceof Uint8Array ? input2 : new Uint8Array(input2);
					w.writeMajor(2, v.byteLength), w.writeUint8Array(v);
					return;
				}
				if (input2 instanceof Map) {
					w.writeMajor(5, input2.size);
					for (let [k, v] of input2) inner(k), inner(v);
				} else {
					let entries = Object.entries(input2);
					w.writeMajor(5, entries.length);
					for (let [k, v] of entries) inner(k), inner(v);
				}
		}
	}
	return inner(input), options.partial ? w.output(!0, options.replacer) : w.output(!1, options.replacer);
}
var F16_SIGN_MASK = 32768, F16_EXP_MASK = 31744, F16_FRAC_MASK = 1023, F16_EXP_SHIFT = 10, F16_EXP_BIAS = 15, F16_EXP_INF_NAN = 31, F16_FRAC_SCALE = 1024, F16_SUBNORMAL_SCALE = 2 ** -14, FLOAT16_EXP_LUT = Array.from({ length: 31 }, (_, e) => 2 ** (e - F16_EXP_BIAS)), Reader = class {
	_view;
	_byte;
	_pos = 0;
	constructor(buffer) {
		this._byte = buffer, this._view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	}
	skip(amount = 1) {
		let pos = this._pos;
		if (this._byte.length - pos < amount) throw new CborRangeError("Tried to read 1 byte beyond buffer bounds");
		this._pos = pos + amount;
	}
	peekUint8() {
		let pos = this._pos;
		if (this._byte.length - pos < 1) throw new CborRangeError("Tried to read 1 byte beyond buffer bounds");
		return this._view.getUint8(pos);
	}
	readUint8() {
		let pos = this._pos;
		if (this._byte.length - pos < 1) throw new CborRangeError("Tried to read 1 byte beyond buffer bounds");
		let val = this._view.getUint8(pos);
		return this._pos = pos + 1, val;
	}
	readUint16() {
		let pos = this._pos;
		if (this._byte.length - pos < 2) throw new CborRangeError("Tried to read 2 bytes beyond buffer bounds");
		let val = this._view.getUint16(pos);
		return this._pos = pos + 2, val;
	}
	readUint32() {
		let pos = this._pos;
		if (this._byte.length - pos < 4) throw new CborRangeError("Tried to read 4 bytes beyond buffer bounds");
		let val = this._view.getUint32(pos);
		return this._pos = pos + 4, val;
	}
	readUint64() {
		let pos = this._pos;
		if (this._byte.length - pos < 8) throw new CborRangeError("Tried to read 8 bytes beyond buffer bounds");
		let val = this._view.getBigUint64(pos);
		return this._pos = pos + 8, val;
	}
	readFloat16() {
		let val = this.readUint16(), sign = val & F16_SIGN_MASK ? -1 : 1, exp = (val & F16_EXP_MASK) >> F16_EXP_SHIFT, frac = val & F16_FRAC_MASK;
		return exp === 0 ? sign * (frac / F16_FRAC_SCALE) * F16_SUBNORMAL_SCALE : exp === F16_EXP_INF_NAN ? frac ? NaN : sign * Number.POSITIVE_INFINITY : sign * (1 + frac / F16_FRAC_SCALE) * FLOAT16_EXP_LUT[exp];
	}
	readFloat32() {
		let pos = this._pos;
		if (this._byte.length - pos < 4) throw new CborRangeError("Tried to read 4 bytes for float32 beyond buffer bounds");
		let val = this._view.getFloat32(pos);
		return this._pos = pos + 4, val;
	}
	readFloat64() {
		let pos = this._pos;
		if (this._byte.length - pos < 8) throw new CborRangeError("Tried to read 8 bytes for float64 beyond buffer bounds");
		let val = this._view.getFloat64(pos);
		return this._pos = pos + 8, val;
	}
	readBytes(amount) {
		let pos = this._pos;
		if (this._byte.length - pos < amount) throw new CborRangeError(`Tried to read ${amount} bytes beyond buffer`);
		return this._pos = pos + amount, this._byte.subarray(pos, this._pos);
	}
	readMajor() {
		let byte = this.readUint8(), major = byte >> 5;
		if (major < 0 || major > 7) throw new CborInvalidMajorError("Received invalid major type");
		return [major, byte & 31];
	}
	readMajorLength(length) {
		if (length <= 23) return length;
		if (length === 24) return this.readUint8();
		if (length === 25) return this.readUint16();
		if (length === 26) return this.readUint32();
		if (length === 27) {
			let read = this.readUint64();
			return read > 9007199254740992 ? read : Number(read);
		}
		throw new CborRangeError("Expected a final length");
	}
};
function infiniteBytes(r, forMajor) {
	let w = new Writer();
	for (;;) {
		let [major, len] = r.readMajor();
		if (major === 7 && len === 31) break;
		if (major !== forMajor) throw new CborInvalidMajorError(`Expected a resource of the same major (${forMajor}) while processing an infinite resource`);
		if (len === 31) throw new CborRangeError("Expected a finite resource while processing an infinite resource");
		w.writeUint8Array(r.readBytes(Number(r.readMajorLength(len))));
	}
	return w.buffer.buffer;
}
var textDecoder = new TextDecoder();
function decode(input, options = {}) {
	return decodeValue(input instanceof Reader ? input : new Reader(input), options);
}
function decodeValue(r, options) {
	let [major, len] = r.readMajor();
	switch (major) {
		case 0: return r.readMajorLength(len);
		case 1: {
			let l = r.readMajorLength(len);
			return typeof l == "bigint" ? -(l + 1n) : -(l + 1);
		}
		case 2: return len !== 31 ? new Uint8Array(r.readBytes(Number(r.readMajorLength(len)))).buffer : infiniteBytes(r, 2);
		case 3: {
			let encoded = len !== 31 ? r.readBytes(Number(r.readMajorLength(len))) : infiniteBytes(r, 3);
			return textDecoder.decode(encoded);
		}
		case 4: {
			if (len !== 31) {
				let l = r.readMajorLength(len), arr2 = Array(l);
				for (let i = 0; i < l; i++) arr2[i] = decodeValue(r, options);
				return arr2;
			}
			let arr = [];
			for (;;) {
				if (r.peekUint8() === 255) {
					r.skip();
					break;
				}
				arr.push(decodeValue(r, options));
			}
			return arr;
		}
		case 5: {
			if (options.map === "map") {
				let map = /* @__PURE__ */ new Map();
				if (len !== 31) {
					let l = r.readMajorLength(len);
					for (let i = 0; i < l; i++) map.set(decodeValue(r, options), decodeValue(r, options));
				} else for (;;) {
					if (r.peekUint8() === 255) {
						r.skip();
						break;
					}
					map.set(decodeValue(r, options), decodeValue(r, options));
				}
				return map;
			}
			let obj = {};
			if (len !== 31) {
				let l = r.readMajorLength(len);
				for (let i = 0; i < l; i++) obj[decodeValue(r, options)] = decodeValue(r, options);
			} else for (;;) {
				if (r.peekUint8() === 255) {
					r.skip();
					break;
				}
				obj[decodeValue(r, options)] = decodeValue(r, options);
			}
			return obj;
		}
		case 6: {
			let tag = Number(r.readMajorLength(len)), value = decodeValue(r, options), replacer = options.tagged?.[tag];
			return replacer ? replacer(value) : new Tagged(tag, value);
		}
		case 7: switch (len) {
			case 20: return !1;
			case 21: return !0;
			case 22: return null;
			case 23: return;
			case 25: return r.readFloat16();
			case 26: return r.readFloat32();
			case 27: return r.readFloat64();
			case 31: throw new CborBreak();
		}
	}
	throw new CborInvalidMajorError(`Unable to decode value with major tag ${major}`);
}
//#endregion
//#region src/cbor/utils.ts
function rangeToCbor([beg, end]) {
	function encodeBound(bound) {
		if (bound instanceof BoundIncluded) return new Tagged(50, bound.value);
		if (bound instanceof BoundExcluded) return new Tagged(51, bound.value);
		return null;
	}
	return [encodeBound(beg), encodeBound(end)];
}
function cborToRange(range) {
	function decodeBound(bound) {
		if (bound === null) return void 0;
		if (bound instanceof BoundIncluded) return bound;
		if (bound instanceof BoundExcluded) return bound;
		throw new SurrealError("Expected the bounds to be decoded already");
	}
	return [decodeBound(range[0]), decodeBound(range[1])];
}
//#endregion
//#region src/cbor/codec.ts
const TAG_SPEC_DATETIME = 0;
const TAG_SPEC_UUID = 37;
const TAG_NONE = 6;
const TAG_TABLE = 7;
const TAG_RECORDID = 8;
const TAG_STRING_UUID = 9;
const TAG_STRING_DECIMAL = 10;
const TAG_CUSTOM_DATETIME = 12;
const TAG_STRING_DURATION = 13;
const TAG_CUSTOM_DURATION = 14;
const TAG_FUTURE = 15;
const TAG_FILE_POINTER = 55;
const TAG_SET = 56;
const TAG_GEOMETRY_POINT = 88;
const TAG_GEOMETRY_LINE = 89;
const TAG_GEOMETRY_POLYGON = 90;
const TAG_GEOMETRY_MULTIPOINT = 91;
const TAG_GEOMETRY_MULTILINE = 92;
const TAG_GEOMETRY_MULTIPOLYGON = 93;
const TAG_GEOMETRY_COLLECTION = 94;
/**
* A class used to encode and decode SurrealQL values using CBOR
*/
var CborCodec = class {
	#options;
	constructor(options) {
		this.#options = options;
	}
	encode(data) {
		return encode(data, {
			replacer: this.replacer,
			partial: false
		});
	}
	decode(data) {
		return decode(data, { tagged: this.tagged });
	}
	replacer = (input) => {
		const value = this.#encodeValue(input);
		if (value instanceof Date) return new Tagged(TAG_CUSTOM_DATETIME, new DateTime(value).toCompact());
		if (value instanceof DateTime) return new Tagged(TAG_CUSTOM_DATETIME, value.toCompact());
		if (value === void 0) return new Tagged(TAG_NONE, null);
		if (value instanceof Uuid) return new Tagged(TAG_SPEC_UUID, value.toBuffer());
		if (value instanceof Decimal) return new Tagged(TAG_STRING_DECIMAL, value.toString());
		if (value instanceof Duration) return new Tagged(TAG_CUSTOM_DURATION, value.toCompact());
		if (value instanceof _RecordId) return new Tagged(TAG_RECORDID, [value.table.name, value.id]);
		if (value instanceof StringRecordId) return new Tagged(TAG_RECORDID, value.toString());
		if (value instanceof _RecordIdRange) return new Tagged(TAG_RECORDID, [value.table.name, new Tagged(49, rangeToCbor([value.begin, value.end]))]);
		if (value instanceof Table) return new Tagged(TAG_TABLE, value.name);
		if (value instanceof Future) return new Tagged(TAG_FUTURE, value.body);
		if (value instanceof Range) return new Tagged(49, rangeToCbor([value.begin, value.end]));
		if (value instanceof FileRef) return new Tagged(TAG_FILE_POINTER, [value.bucket, value.key]);
		if (value instanceof Set) return new Tagged(TAG_SET, [...value]);
		if (value instanceof GeometryPoint) return new Tagged(TAG_GEOMETRY_POINT, value.point);
		if (value instanceof GeometryLine) return new Tagged(TAG_GEOMETRY_LINE, value.line);
		if (value instanceof GeometryPolygon) return new Tagged(TAG_GEOMETRY_POLYGON, value.polygon);
		if (value instanceof GeometryMultiPoint) return new Tagged(TAG_GEOMETRY_MULTIPOINT, value.points);
		if (value instanceof GeometryMultiLine) return new Tagged(TAG_GEOMETRY_MULTILINE, value.lines);
		if (value instanceof GeometryMultiPolygon) return new Tagged(TAG_GEOMETRY_MULTIPOLYGON, value.polygons);
		if (value instanceof GeometryCollection) return new Tagged(TAG_GEOMETRY_COLLECTION, value.collection);
		return value;
	};
	tagged = {
		[TAG_SPEC_DATETIME]: (v) => this.#decodeValue(this.#resolveSpecDate(v)),
		[TAG_CUSTOM_DATETIME]: (v) => this.#decodeValue(this.#resolveCustomDate(v)),
		[TAG_SPEC_UUID]: (v) => this.#decodeValue(new Uuid(v)),
		[TAG_STRING_UUID]: (v) => this.#decodeValue(new Uuid(v)),
		[TAG_NONE]: (_v) => this.#decodeValue(void 0),
		[TAG_STRING_DECIMAL]: (v) => this.#decodeValue(new Decimal(v)),
		[TAG_STRING_DURATION]: (v) => this.#decodeValue(new Duration(v)),
		[TAG_CUSTOM_DURATION]: (v) => this.#decodeValue(new Duration(v)),
		[TAG_TABLE]: (v) => this.#decodeValue(new Table(v)),
		[TAG_FUTURE]: (v) => this.#decodeValue(new Future(v)),
		[49]: (v) => this.#decodeValue(new Range(...cborToRange(v))),
		[50]: (v) => this.#decodeValue(new BoundIncluded(v)),
		[51]: (v) => this.#decodeValue(new BoundExcluded(v)),
		[TAG_RECORDID]: (v) => {
			if (v[1] instanceof Range) return this.#decodeValue(new _RecordIdRange(v[0], v[1].begin, v[1].end));
			return this.#decodeValue(new _RecordId(v[0], v[1]));
		},
		[TAG_FILE_POINTER]: (v) => this.#decodeValue(new FileRef(v[0], v[1])),
		[TAG_SET]: (v) => this.#decodeValue(new Set(v)),
		[TAG_GEOMETRY_POINT]: (v) => this.#decodeValue(new GeometryPoint(v)),
		[TAG_GEOMETRY_LINE]: (v) => this.#decodeValue(new GeometryLine(v)),
		[TAG_GEOMETRY_POLYGON]: (v) => this.#decodeValue(new GeometryPolygon(v)),
		[TAG_GEOMETRY_MULTIPOINT]: (v) => this.#decodeValue(new GeometryMultiPoint(v)),
		[TAG_GEOMETRY_MULTILINE]: (v) => this.#decodeValue(new GeometryMultiLine(v)),
		[TAG_GEOMETRY_MULTIPOLYGON]: (v) => this.#decodeValue(new GeometryMultiPolygon(v)),
		[TAG_GEOMETRY_COLLECTION]: (v) => this.#decodeValue(new GeometryCollection(v))
	};
	#resolveSpecDate(v) {
		return this.#options.useNativeDates ? new Date(v) : new DateTime(v);
	}
	#resolveCustomDate(v) {
		return this.#options.useNativeDates ? /* @__PURE__ */ new Date(Number(v[0]) * 1e3 + Number(v[1]) / 1e6) : new DateTime(v);
	}
	#encodeValue(v) {
		return this.#options.valueEncodeVisitor ? this.#options.valueEncodeVisitor(v) : v;
	}
	#decodeValue(v) {
		return this.#options.valueDecodeVisitor ? this.#options.valueDecodeVisitor(v) : v;
	}
};
//#endregion
//#region src/engine/diagnostics.ts
/**
* The DiagnosticsEngine is a utility allowing you to intercept low level communication
* within the SDK.
*/
var DiagnosticsEngine = class {
	#delegate;
	#callback;
	constructor(delegate, callback) {
		this.#delegate = delegate;
		this.#callback = callback;
	}
	get features() {
		return this.#delegate.features;
	}
	subscribe(event, listener) {
		return this.#delegate.subscribe(event, listener);
	}
	open(state) {
		this.#diagnose("open", () => Promise.resolve(this.#delegate.open(state)), () => ({ url: state.url }));
	}
	async close() {
		return this.#diagnose("close", () => this.#delegate.close(), () => void 0);
	}
	ready() {
		this.#delegate.ready();
	}
	async health() {
		return this.#diagnose("health", () => this.#delegate.health(), () => void 0);
	}
	async version() {
		return this.#diagnose("version", () => this.#delegate.version(), (info) => info);
	}
	async sessions() {
		return this.#diagnose("sessions", () => this.#delegate.sessions(), (list) => list);
	}
	async attach(session) {
		this.#diagnose("attach", () => this.#delegate.attach(session), () => void 0);
	}
	async detach(session) {
		return this.#diagnose("detach", () => this.#delegate.detach(session), () => void 0);
	}
	async use(what, session) {
		return this.#diagnose("use", () => this.#delegate.use(what, session), () => ({
			requested: what,
			session
		}));
	}
	async signup(auth, session) {
		return this.#diagnose("signup", () => this.#delegate.signup(auth, session), () => ({
			variant: "system_user",
			session
		}));
	}
	async signin(auth, session) {
		return this.#diagnose("signin", () => this.#delegate.signin(auth, session), () => {
			return {
				variant: "key" in auth ? "bearer_access" : "variables" in auth ? "record_access" : "system_user",
				session
			};
		});
	}
	async authenticate(token, session) {
		return this.#diagnose("authenticate", () => this.#delegate.authenticate(token, session), () => ({
			variant: "token",
			session
		}));
	}
	async set(name, value, session) {
		return this.#diagnose("set", () => this.#delegate.set(name, value, session), () => ({
			name,
			value,
			session
		}));
	}
	async unset(name, session) {
		return this.#diagnose("unset", () => this.#delegate.unset(name, session), () => ({
			name,
			session
		}));
	}
	async invalidate(session) {
		return this.#diagnose("invalidate", () => this.#delegate.invalidate(session), () => ({ session }));
	}
	async refresh(tokens, session) {
		return this.#diagnose("refresh", () => this.#delegate.refresh(tokens, session), () => ({ session }));
	}
	async revoke(tokens, session) {
		return this.#diagnose("revoke", () => this.#delegate.revoke(tokens, session), () => ({ session }));
	}
	async reset(session) {
		return this.#diagnose("reset", () => this.#delegate.reset(session), () => ({ session }));
	}
	async begin(session) {
		return this.#diagnose("begin", () => this.#delegate.begin(session), () => ({ session }));
	}
	async commit(txn, session) {
		return this.#diagnose("commit", () => this.#delegate.commit(txn, session), () => ({
			txn,
			session
		}));
	}
	async cancel(txn, session) {
		return this.#diagnose("cancel", () => this.#delegate.cancel(txn, session), () => ({
			txn,
			session
		}));
	}
	async importSql(data) {
		return this.#diagnose("importSql", () => this.#delegate.importSql(data), () => void 0);
	}
	async exportSql(options) {
		return this.#diagnose("exportSql", () => this.#delegate.exportSql(options), () => void 0);
	}
	async exportMlModel(options) {
		return this.#diagnose("exportMlModel", () => this.#delegate.exportMlModel(options), () => void 0);
	}
	query(query, session, txn) {
		const measure = Duration.measure();
		const callback = this.#callback;
		const debugKey = Uuid.v4();
		callback({
			type: "query",
			key: debugKey,
			phase: "before"
		});
		const delegateResult = this.#delegate.query(query, session, txn);
		return { async *[Symbol.asyncIterator]() {
			try {
				for await (const chunk of delegateResult) {
					callback({
						type: "query",
						key: debugKey,
						phase: "progress",
						result: {
							query: query.query,
							params: query.bindings,
							transaction: txn,
							chunk,
							session
						}
					});
					yield chunk;
				}
				callback({
					type: "query",
					key: debugKey,
					phase: "after",
					success: true,
					duration: measure(),
					result: {
						query: query.query,
						params: query.bindings,
						transaction: txn,
						session
					}
				});
			} catch (error) {
				callback({
					type: "query",
					key: debugKey,
					phase: "after",
					success: false,
					duration: measure(),
					error
				});
				throw error;
			}
		} };
	}
	liveQuery(id) {
		const measure = Duration.measure();
		const callback = this.#callback;
		const debugKey = Uuid.v4();
		callback({
			type: "liveQuery",
			key: debugKey,
			phase: "before"
		});
		const delegateResult = this.#delegate.liveQuery(id);
		return { async *[Symbol.asyncIterator]() {
			try {
				for await (const message of delegateResult) {
					callback({
						type: "liveQuery",
						key: debugKey,
						phase: "progress",
						result: {
							id,
							message
						}
					});
					yield message;
				}
				callback({
					type: "liveQuery",
					key: debugKey,
					phase: "after",
					success: true,
					duration: measure(),
					result: { id }
				});
			} catch (error) {
				callback({
					type: "liveQuery",
					key: debugKey,
					phase: "after",
					success: false,
					duration: measure(),
					error
				});
				throw error;
			}
		} };
	}
	async #diagnose(type, callback, result) {
		const measure = Duration.measure();
		const key = Uuid.v4();
		this.#callback({
			type,
			key,
			phase: "before"
		});
		try {
			const response = await callback();
			this.#callback({
				type,
				key,
				phase: "after",
				success: true,
				duration: measure(),
				result: result(response)
			});
			return response;
		} catch (error) {
			this.#callback({
				type,
				key,
				phase: "after",
				success: false,
				duration: measure(),
				error
			});
			throw error;
		}
	}
};
//#endregion
//#region src/internal/get-session-from-state.ts
function getSessionFromState(state, session) {
	const sessionState = session ? state.sessions.get(session) : state.rootSession;
	if (!sessionState) throw new InvalidSessionError(session);
	return sessionState;
}
//#endregion
//#region src/internal/http.ts
async function fetchSurreal(context, state, session, options) {
	const endpoint = new URL(options.url ?? state.url);
	const fetchImpl = context.options.fetchImpl ?? globalThis.fetch;
	const headerMap = {
		"Content-Type": "application/cbor",
		Accept: "application/cbor",
		...options.headers
	};
	if (session.namespace) headerMap["Surreal-NS"] = session.namespace;
	if (session.database) headerMap["Surreal-DB"] = session.database;
	if (session.accessToken) headerMap.Authorization = `Bearer ${session.accessToken}`;
	endpoint.protocol = endpoint.protocol.replace("ws", "http");
	const encodedBody = encodeBody(context, options.body);
	const response = await fetchImpl(endpoint, {
		method: options.method ?? "POST",
		headers: headerMap,
		body: encodedBody,
		duplex: "half"
	});
	if (response.status === 200) return response;
	const buffer = await response.arrayBuffer();
	throw new HttpConnectionError(new TextDecoder("utf-8").decode(buffer), response.status, response.statusText, buffer);
}
const REMOTE_PROTOCOLS = new Set([
	"http",
	"https",
	"ws",
	"wss"
]);
function parseEndpoint(value) {
	const url = typeof value === "string" ? new URL(value) : new URL(value.href);
	const protocol = url.protocol.slice(0, -1);
	if (REMOTE_PROTOCOLS.has(protocol) && !url.pathname.endsWith("/rpc")) {
		if (!url.pathname.endsWith("/")) url.pathname += "/";
		url.pathname += "rpc";
	}
	return url;
}
function encodeBody(context, body) {
	if (body instanceof ReadableStream || body instanceof Blob) return body;
	return body ? context.codecs.cbor.encode(body) : void 0;
}
//#endregion
//#region src/internal/parse-error.ts
/**
* Maps legacy JSON-RPC error codes to ErrorKind values.
* Used when `kind` is absent (old server format).
*/
const CODE_TO_KIND = {
	[-32700]: "Validation",
	[-32600]: "Validation",
	[-32601]: "NotFound",
	[-32602]: "NotAllowed",
	[-32603]: "Validation",
	[-32604]: "Configuration",
	[-32605]: "Configuration",
	[-32606]: "Configuration",
	[-32e3]: "Internal",
	[-32001]: "Connection",
	[-32002]: "NotAllowed",
	[-32003]: "Query",
	[-32004]: "Query",
	[-32005]: "Query",
	[-32006]: "Thrown",
	[-32007]: "Serialization",
	[-32008]: "Serialization"
};
/**
* Resolves the error kind from the raw server data.
* - If `kind` is present, uses it directly.
* - If `kind` is absent, derives it from the legacy `code`.
* - Falls back to `"Internal"` if neither yields a known kind.
*/
function resolveKind(kind, code) {
	if (kind) return kind;
	if (code !== void 0) return CODE_TO_KIND[code] ?? "Internal";
	return "Internal";
}
/**
* Recursively parse a cause chain from the wire format into a `ServerError` chain.
* Each cause becomes a fully typed `ServerError` (or subclass) with its own
* `cause` set as the native `Error.cause`, so the entire chain is visible
* in standard JS tooling.
*/
function parseCause(raw) {
	if (!raw) return void 0;
	return createServerError({
		kind: resolveKind(raw.kind, void 0),
		message: raw.message,
		details: raw.details,
		cause: parseCause(raw.cause) ?? null
	});
}
/**
* Factory that creates the correct `ServerError` subclass based on `kind`.
* Unknown kinds produce a plain `ServerError` instance (forward-compatible).
*/
function createServerError(options) {
	switch (options.kind) {
		case "Validation": return new ValidationError(options);
		case "Configuration": return new ConfigurationError(options);
		case "Thrown": return new ThrownError(options);
		case "Query": return new QueryError(options);
		case "Serialization": return new SerializationError(options);
		case "NotAllowed": return new NotAllowedError(options);
		case "NotFound": return new NotFoundError(options);
		case "AlreadyExists": return new AlreadyExistsError(options);
		case "Internal": return new InternalError(options);
		default: return new ServerError(options);
	}
}
/**
* Parse an RPC-level error object into a `ServerError` (or subclass).
* Handles both old format (`{ code, message }`) and new format
* (`{ code, kind, message, details? }`).
*/
function parseRpcError(raw) {
	return createServerError({
		kind: resolveKind(raw.kind, raw.code),
		code: raw.code,
		message: raw.message,
		details: raw.details,
		cause: parseCause(raw.cause) ?? null
	});
}
/**
* Parse a query result error into a `ServerError` (or subclass).
* Note: query result errors use `result` as the message field and
* have no `code` field.
*/
function parseQueryError(raw) {
	const kind = resolveKind(raw.kind, void 0);
	let details = raw.details;
	if (details && typeof details === "object" && details.kind === kind && "details" in details && typeof details.details === "object") details = details.details;
	return createServerError({
		kind,
		code: 0,
		message: raw.result,
		details,
		cause: parseCause(raw.cause) ?? null
	});
}
//#endregion
//#region src/internal/build-rpc-auth.ts
function buildRpcAuth(session, auth) {
	if ("key" in auth) return {
		ns: auth.namespace,
		db: auth.database,
		ac: auth.access,
		key: auth.key
	};
	if ("variables" in auth) {
		const namespace = auth.namespace ?? session.namespace;
		const database = auth.database ?? session.database;
		if (!database || !namespace) throw new MissingNamespaceDatabaseError();
		return {
			...auth.variables,
			ac: auth.access,
			ns: namespace,
			db: database
		};
	}
	const access = "access" in auth ? auth.access : void 0;
	const namespace = "namespace" in auth ? auth.namespace : void 0;
	const database = "database" in auth ? auth.database : void 0;
	const result = {
		user: auth.username,
		pass: auth.password
	};
	if (database && !namespace) throw new MissingNamespaceDatabaseError();
	if (access) result.ac = access;
	if (namespace) result.ns = namespace;
	if (database) result.db = database;
	return result;
}
//#endregion
//#region src/engine/rpc.ts
/**
* JSON-based engines implement the SurrealDB v1 protocol, which uses
* JSON objects to communicate with the server.
*/
var RpcEngine = class {
	_context;
	_state;
	constructor(context) {
		this._context = context;
	}
	async health() {
		await this.send({ method: "health" });
	}
	async version() {
		return { version: await this.send({ method: "version" }) };
	}
	async sessions() {
		return await this.send({ method: "sessions" });
	}
	async attach(session) {
		await this.send({
			method: "attach",
			session
		});
	}
	async detach(session) {
		return await this.send({
			method: "detach",
			session
		});
	}
	async use(what, session) {
		return await this.send({
			method: "use",
			params: [what.namespace, what.database],
			session
		}) ?? {};
	}
	async signup(auth, session) {
		if (!this._state) throw new ConnectionUnavailableError();
		const sessionState = getSessionFromState(this._state, session);
		const response = await this.send({
			method: "signup",
			params: [buildRpcAuth(sessionState, auth)],
			session
		});
		return this.parseTokens(response);
	}
	async signin(auth, session) {
		if (!this._state) throw new ConnectionUnavailableError();
		const sessionState = getSessionFromState(this._state, session);
		const response = await this.send({
			method: "signin",
			params: [buildRpcAuth(sessionState, auth)],
			session
		});
		return this.parseTokens(response);
	}
	async authenticate(token, session) {
		await this.send({
			method: "authenticate",
			params: [token],
			session
		});
	}
	async set(name, value, session) {
		await this.send({
			method: "let",
			params: [name, value],
			session
		});
	}
	async unset(name, session) {
		await this.send({
			method: "unset",
			params: [name],
			session
		});
	}
	async refresh(tokens, session) {
		return this.parseTokens(await this.send({
			method: "refresh",
			params: [tokens],
			session
		}));
	}
	async revoke(tokens, session) {
		await this.send({
			method: "revoke",
			params: [tokens],
			session
		});
	}
	async invalidate(session) {
		await this.send({
			method: "invalidate",
			session
		});
	}
	async reset(session) {
		await this.send({
			method: "reset",
			session
		});
	}
	async begin(session) {
		return await this.send({
			method: "begin",
			session
		});
	}
	async commit(txn, session) {
		await this.send({
			method: "commit",
			params: [txn],
			session
		});
	}
	async cancel(txn, session) {
		await this.send({
			method: "cancel",
			params: [txn],
			session
		});
	}
	async importSql(data) {
		if (!this._state) throw new ConnectionUnavailableError();
		const endpoint = new URL(this._state.url);
		endpoint.pathname = `${endpoint.pathname.slice(0, -4)}/import`;
		await fetchSurreal(this._context, this._state, this._state.rootSession, {
			body: typeof data === "string" ? new Blob([data]) : data,
			url: endpoint,
			headers: { Accept: "application/json" }
		});
	}
	async exportSql(options) {
		if (!this._state) throw new ConnectionUnavailableError();
		const endpoint = new URL(this._state.url);
		endpoint.pathname = `${endpoint.pathname.slice(0, -4)}/export`;
		return fetchSurreal(this._context, this._state, this._state.rootSession, {
			body: options ?? {},
			url: endpoint,
			headers: { Accept: "plain/text" }
		});
	}
	async exportMlModel(options) {
		if (!this._state) throw new ConnectionUnavailableError();
		const endpoint = new URL(this._state.url);
		endpoint.pathname = `${endpoint.pathname.slice(0, -4)}/ml/export/${options.name}/${options.version}`;
		return fetchSurreal(this._context, this._state, this._state.rootSession, {
			url: endpoint,
			method: "GET"
		});
	}
	async *query(query, session, txn) {
		const responses = await this.send({
			method: "query",
			params: [query.query, query.bindings],
			session,
			txn
		});
		let index = 0;
		for (const response of responses) {
			const chunk = {
				query: index++,
				batch: 0,
				kind: "single",
				stats: {
					bytesReceived: -1,
					bytesScanned: -1,
					recordsReceived: -1,
					recordsScanned: -1,
					duration: Duration.parseFloat(response.time)
				}
			};
			if (response.status === "OK") {
				chunk.type = response.type;
				if (Array.isArray(response.result)) {
					chunk.kind = "batched-final";
					chunk.result = response.result;
				} else chunk.result = [response.result];
			} else chunk.error = parseQueryError(response);
			yield chunk;
		}
	}
	parseTokens(response) {
		if (typeof response === "string") return {
			access: response,
			refresh: void 0
		};
		if (typeof response === "object") return response;
		throw new UnexpectedServerResponseError(response);
	}
};
//#endregion
//#region src/engine/http.ts
const ALWAYS_ALLOW = new Set([
	"use",
	"signin",
	"signup",
	"authenticate",
	"version",
	"query",
	"info",
	"health"
]);
/**
* An engine that communicates by sending individual HTTP requests
*/
var HttpEngine = class extends RpcEngine {
	#publisher = new Publisher();
	features = new Set([
		Features.RefreshTokens,
		Features.Api,
		Features.ExportImportRaw,
		Features.SurrealML
	]);
	subscribe(event, listener) {
		return this.#publisher.subscribe(event, listener);
	}
	open(state) {
		this._state = state;
		setTimeout(() => {
			this.#publisher.publish("connected");
		});
	}
	async close() {
		this._state = void 0;
		this.#publisher.publish("disconnected");
	}
	ready() {}
	async send(request) {
		if (!this._state) throw new ConnectionUnavailableError();
		switch (request.method) {
			case "use":
			case "let":
			case "unset":
			case "reset":
			case "invalidate":
				if (request.method === "use" && isEmptyUseParams(request.params)) break;
				return;
		}
		const session = getSessionFromState(this._state, request.session);
		if ((!session.namespace || !session.database) && !ALWAYS_ALLOW.has(request.method)) throw new MissingNamespaceDatabaseError();
		switch (request.method) {
			case "query":
				request.params = [request.params?.[0], {
					...session.variables,
					...request.params?.[1] ?? {}
				}];
				break;
		}
		const id = this._context.uniqueId();
		const buffer = await (await fetchSurreal(this._context, this._state, session, { body: {
			id,
			...request
		} })).arrayBuffer();
		let response;
		try {
			response = this._context.codecs.cbor.decode(new Uint8Array(buffer));
		} catch (error) {
			throw new UnexpectedServerResponseError(error);
		}
		if (response.error) throw parseRpcError(response.error);
		return response.result;
	}
	liveQuery() {
		throw new UnsupportedFeatureError(Features.LiveQueries);
	}
};
function isEmptyUseParams(params) {
	return Array.isArray(params) && typeof params[0] === "undefined" && typeof params[1] === "undefined";
}
//#endregion
//#region node_modules/@tauri-apps/api/external/tslib/tslib.es6.js
/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
function __classPrivateFieldGet(receiver, state, kind, f) {
	if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
	if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
	return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}
function __classPrivateFieldSet(receiver, state, value, kind, f) {
	if (kind === "m") throw new TypeError("Private method is not writable");
	if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
	if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
	return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
}
//#endregion
//#region node_modules/@tauri-apps/api/core.js
var _Channel_onmessage, _Channel_nextMessageIndex, _Channel_pendingMessages, _Channel_messageEndIndex;
/**
* Invoke your custom commands.
*
* This package is also accessible with `window.__TAURI__.core` when [`app.withGlobalTauri`](https://v2.tauri.app/reference/config/#withglobaltauri) in `tauri.conf.json` is set to `true`.
* @module
*/
/**
* A key to be used to implement a special function
* on your types that define how your type should be serialized
* when passing across the IPC.
* @example
* Given a type in Rust that looks like this
* ```rs
* #[derive(serde::Serialize, serde::Deserialize)
* enum UserId {
*   String(String),
*   Number(u32),
* }
* ```
* `UserId::String("id")` would be serialized into `{ String: "id" }`
* and so we need to pass the same structure back to Rust
* ```ts
* import { SERIALIZE_TO_IPC_FN } from "@tauri-apps/api/core"
*
* class UserIdString {
*   id
*   constructor(id) {
*     this.id = id
*   }
*
*   [SERIALIZE_TO_IPC_FN]() {
*     return { String: this.id }
*   }
* }
*
* class UserIdNumber {
*   id
*   constructor(id) {
*     this.id = id
*   }
*
*   [SERIALIZE_TO_IPC_FN]() {
*     return { Number: this.id }
*   }
* }
*
* type UserId = UserIdString | UserIdNumber
* ```
*
*/
const SERIALIZE_TO_IPC_FN = "__TAURI_TO_IPC_KEY__";
/**
* Stores the callback in a known location, and returns an identifier that can be passed to the backend.
* The backend uses the identifier to `eval()` the callback.
*
* @return An unique identifier associated with the callback function.
*
* @since 1.0.0
*/
function transformCallback(callback, once = false) {
	return window.__TAURI_INTERNALS__.transformCallback(callback, once);
}
var Channel = class {
	constructor(onmessage) {
		_Channel_onmessage.set(this, void 0);
		_Channel_nextMessageIndex.set(this, 0);
		_Channel_pendingMessages.set(this, []);
		_Channel_messageEndIndex.set(this, void 0);
		__classPrivateFieldSet(this, _Channel_onmessage, onmessage || (() => {}), "f");
		this.id = transformCallback((rawMessage) => {
			const index = rawMessage.index;
			if ("end" in rawMessage) {
				if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) this.cleanupCallback();
				else __classPrivateFieldSet(this, _Channel_messageEndIndex, index, "f");
				return;
			}
			const message = rawMessage.message;
			if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
				__classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message);
				__classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
				while (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") in __classPrivateFieldGet(this, _Channel_pendingMessages, "f")) {
					const message = __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
					__classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message);
					delete __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
					__classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
				}
				if (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") === __classPrivateFieldGet(this, _Channel_messageEndIndex, "f")) this.cleanupCallback();
			} else __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[index] = message;
		});
	}
	cleanupCallback() {
		window.__TAURI_INTERNALS__.unregisterCallback(this.id);
	}
	set onmessage(handler) {
		__classPrivateFieldSet(this, _Channel_onmessage, handler, "f");
	}
	get onmessage() {
		return __classPrivateFieldGet(this, _Channel_onmessage, "f");
	}
	[(_Channel_onmessage = /* @__PURE__ */ new WeakMap(), _Channel_nextMessageIndex = /* @__PURE__ */ new WeakMap(), _Channel_pendingMessages = /* @__PURE__ */ new WeakMap(), _Channel_messageEndIndex = /* @__PURE__ */ new WeakMap(), SERIALIZE_TO_IPC_FN)]() {
		return `__CHANNEL__:${this.id}`;
	}
	toJSON() {
		return this[SERIALIZE_TO_IPC_FN]();
	}
};
/**
* Sends a message to the backend.
* @example
* ```typescript
* import { invoke } from '@tauri-apps/api/core';
* await invoke('login', { user: 'tauri', password: 'poiwe3h4r5ip3yrhtew9ty' });
* ```
*
* @param cmd The command name.
* @param args The optional arguments to pass to the command.
* @param options The request options.
* @return A promise resolving or rejecting to the backend response.
*
* @since 1.0.0
*/
async function invoke(cmd, args = {}, options) {
	return window.__TAURI_INTERNALS__.invoke(cmd, args, options);
}
//#endregion
//#region src/engine/tauri.ts
const ROOT_SESSION_KEY = "__root__";
function invokeBridge(command, args) {
	return invoke(command, args);
}
function asError(error) {
	if (error instanceof Error) return error;
	if (typeof error === "object" && error !== null) {
		const maybe = error;
		const code = typeof maybe.code === "string" ? maybe.code : null;
		const message = typeof maybe.message === "string" ? maybe.message : String(error);
		return new Error(code ? `${code}: ${message}` : message);
	}
	return new Error(String(error));
}
async function getBucketFolderAllowlist() {
	return invokeBridge("db_bucket_folder_allowlist");
}
function sessionKey(session) {
	return session ? session.toString() : ROOT_SESSION_KEY;
}
function queryTypeFromSql(sql) {
	const normalized = sql.trim().toUpperCase();
	if (normalized.startsWith("LIVE ")) return "live";
	if (normalized.startsWith("KILL ")) return "kill";
	return "other";
}
function normalizeLiveSql(sql) {
	return sql.replace(/(LIVE\s+SELECT\s+[\s\S]*?\s+FROM\s+)'([A-Za-z0-9_]+)'/i, "$1$2");
}
function isSafeTableIdentifier(value) {
	return /^[A-Za-z0-9_]+$/.test(value);
}
function extractLiveTableIdentifier(value) {
	if (typeof value === "string" && isSafeTableIdentifier(value)) return value;
	if (!value || typeof value !== "object") return null;
	const obj = value;
	const tableLike = [
		obj.tb,
		obj.table,
		obj.name
	].find((entry) => typeof entry === "string");
	if (typeof tableLike === "string" && isSafeTableIdentifier(tableLike)) return tableLike;
	return null;
}
function isSafeRecordIdentifier(value) {
	return /^[A-Za-z0-9_]+:[A-Za-z0-9_\-]+$/.test(value);
}
function extractCreateTargetIdentifier(value) {
	if (value && typeof value === "object") {
		const rendered = "toString" in value ? String(value.toString()) : null;
		if (rendered) {
			if (isSafeTableIdentifier(rendered) || isSafeRecordIdentifier(rendered)) return rendered;
		}
	}
	const normalized = normalizeSurrealValue(value);
	if (normalized !== value) {
		if (typeof normalized === "string") {
			if (isSafeTableIdentifier(normalized) || isSafeRecordIdentifier(normalized)) return normalized;
		}
		if (normalized && typeof normalized === "object") {
			const normalizedAsObject = normalized;
			if ("RecordId" in normalizedAsObject) {
				const nested = extractCreateTargetIdentifier(normalizedAsObject.RecordId);
				if (nested) return nested;
			}
		}
	}
	if (typeof value === "string") {
		if (isSafeTableIdentifier(value) || isSafeRecordIdentifier(value)) return value;
		return null;
	}
	if (!value || typeof value !== "object") return null;
	const obj = value;
	const tableLike = [
		obj.tb,
		obj.table,
		obj.name
	].find((entry) => typeof entry === "string");
	if (typeof tableLike !== "string" || !isSafeTableIdentifier(tableLike)) return null;
	const keyLike = [obj.id, obj.key].find((entry) => typeof entry === "string");
	if (!keyLike) {
		const normalizedKey = normalizeSurrealValue(obj.id ?? obj.key);
		if (typeof normalizedKey === "string") {
			if (isSafeRecordIdentifier(normalizedKey)) return normalizedKey;
			if (/^[A-Za-z0-9_\-]+$/.test(normalizedKey)) return `${tableLike}:${normalizedKey}`;
		}
		if (typeof normalizedKey === "number") return `${tableLike}:${String(normalizedKey)}`;
		return tableLike;
	}
	if (!/^[A-Za-z0-9_\-]+$/.test(keyLike)) return null;
	return `${tableLike}:${keyLike}`;
}
function materializeCreateUpsertSqlWithBindings(sql, bindings) {
	if (!bindings || Object.keys(bindings).length === 0) return {
		sql,
		bindings
	};
	const targetBindingMatch = sql.match(/^\s*(CREATE|UPSERT)\s+\$([A-Za-z0-9_]+)\b/i);
	if (!targetBindingMatch) return {
		sql,
		bindings
	};
	const op = targetBindingMatch[1];
	const bindingKey = targetBindingMatch[2];
	const targetIdentifier = extractCreateTargetIdentifier(bindings[bindingKey]);
	if (!targetIdentifier) return {
		sql,
		bindings
	};
	const sqlWithTarget = sql.replace(new RegExp(`^\\s*${op}\\s+\\$${bindingKey}\\b`, "i"), `${op} ${targetIdentifier}`);
	const nextBindings = { ...bindings };
	delete nextBindings[bindingKey];
	return {
		sql: sqlWithTarget,
		bindings: Object.keys(nextBindings).length > 0 ? nextBindings : void 0
	};
}
function materializeBoundIdentifierSqlWithBindings(sql, bindings) {
	if (!bindings || Object.keys(bindings).length === 0) return {
		sql,
		bindings
	};
	let nextSql = sql;
	const nextBindings = { ...bindings };
	const replaceSingleBinding = (regex, replacer) => {
		const match = nextSql.match(regex);
		if (!match) return;
		const bindingKey = match[1];
		const resolvedIdentifier = extractCreateTargetIdentifier(nextBindings[bindingKey]);
		if (!resolvedIdentifier) return;
		nextSql = nextSql.replace(regex, replacer(resolvedIdentifier, bindingKey));
		delete nextBindings[bindingKey];
	};
	replaceSingleBinding(/\bFROM\s+ONLY\s+\$([A-Za-z0-9_]+)\b/i, (resolvedIdentifier) => `FROM ONLY ${resolvedIdentifier}`);
	replaceSingleBinding(/^\s*UPDATE\s+\$([A-Za-z0-9_]+)\b/i, (resolvedIdentifier) => `UPDATE ${resolvedIdentifier}`);
	replaceSingleBinding(/^\s*UPDATE\s+ONLY\s+\$([A-Za-z0-9_]+)\b/i, (resolvedIdentifier) => `UPDATE ONLY ${resolvedIdentifier}`);
	replaceSingleBinding(/^\s*DELETE\s+\$([A-Za-z0-9_]+)\b/i, (resolvedIdentifier) => `DELETE ${resolvedIdentifier}`);
	replaceSingleBinding(/^\s*DELETE\s+ONLY\s+\$([A-Za-z0-9_]+)\b/i, (resolvedIdentifier) => `DELETE ONLY ${resolvedIdentifier}`);
	const relateMatch = nextSql.match(/^\s*RELATE\s+(ONLY\s+)?\$([A-Za-z0-9_]+)->\$([A-Za-z0-9_]+)->\$([A-Za-z0-9_]+)\b/i);
	if (relateMatch) {
		const onlyPrefix = relateMatch[1] ?? "";
		const fromKey = relateMatch[2];
		const edgeKey = relateMatch[3];
		const toKey = relateMatch[4];
		const fromIdentifier = extractCreateTargetIdentifier(nextBindings[fromKey]);
		const edgeIdentifier = extractCreateTargetIdentifier(nextBindings[edgeKey]);
		const toIdentifier = extractCreateTargetIdentifier(nextBindings[toKey]);
		if (fromIdentifier && edgeIdentifier && toIdentifier) {
			nextSql = nextSql.replace(/^\s*RELATE\s+(ONLY\s+)?\$([A-Za-z0-9_]+)->\$([A-Za-z0-9_]+)->\$([A-Za-z0-9_]+)\b/i, `RELATE ${onlyPrefix}${fromIdentifier}->${edgeIdentifier}->${toIdentifier}`);
			delete nextBindings[fromKey];
			delete nextBindings[edgeKey];
			delete nextBindings[toKey];
		}
	}
	return {
		sql: nextSql,
		bindings: Object.keys(nextBindings).length > 0 ? nextBindings : void 0
	};
}
function materializeLiveSqlWithBindings(sql, bindings) {
	const normalizedSql = normalizeLiveSql(sql);
	if (!bindings || Object.keys(bindings).length === 0) return {
		sql: normalizedSql,
		bindings
	};
	const fromBindingMatch = normalizedSql.match(/\bFROM\s+\$([A-Za-z0-9_]+)/i);
	if (!fromBindingMatch) return {
		sql: normalizedSql,
		bindings
	};
	const bindingKey = fromBindingMatch[1];
	const bindingValue = bindings[bindingKey];
	const tableIdentifier = extractLiveTableIdentifier(bindingValue);
	if (!tableIdentifier) return {
		sql: normalizedSql,
		bindings
	};
	const sqlWithTable = normalizedSql.replace(new RegExp(`\\bFROM\\s+\\$${bindingKey}\\b`, "i"), `FROM ${tableIdentifier}`);
	const nextBindings = { ...bindings };
	delete nextBindings[bindingKey];
	return {
		sql: sqlWithTable,
		bindings: Object.keys(nextBindings).length > 0 ? nextBindings : void 0
	};
}
function compactSql(sql) {
	const normalized = sql.replace(/\s+/g, " ").trim();
	return normalized.length > 220 ? `${normalized.slice(0, 220)}...` : normalized;
}
function liveStreamIdFromEvent(event) {
	return event.data.streamId ?? event.data.stream_id ?? "unknown";
}
function liveQueryIdFromEvent(event) {
	return event.data.queryId ?? event.data.query_id ?? "unknown";
}
function isTauriDebugEnabled() {
	if (globalThis.__SURREAL_TAURI_DEBUG === true) return true;
	try {
		if (typeof localStorage !== "undefined") return localStorage.getItem("surreal.tauri.debug") === "1";
	} catch {}
	return false;
}
function tauriDebug(scope, message, details) {
	if (!isTauriDebugEnabled()) return;
	if (details === void 0) {
		console.debug(`[surreal-tauri][${scope}] ${message}`);
		return;
	}
	console.debug(`[surreal-tauri][${scope}] ${message}`, details);
}
function normalizeSurrealValue(value) {
	if (Array.isArray(value)) return value.map((item) => normalizeSurrealValue(item));
	if (!value || typeof value !== "object") return value;
	const obj = value;
	const keys = Object.keys(obj);
	if (keys.length === 1) {
		const key = keys[0];
		const inner = obj[key];
		if (key === "String" || key === "Bool" || key === "Null") return inner;
		if (key === "None") return null;
		if (key === "Number") return normalizeSurrealValue(inner);
		if (key === "Int" || key === "Float" || key === "Decimal") {
			const numeric = Number(inner);
			return Number.isNaN(numeric) ? inner : numeric;
		}
		if (key === "Array" && Array.isArray(inner)) return inner.map((item) => normalizeSurrealValue(item));
		if (key === "Object" && inner && typeof inner === "object") {
			const mapped = {};
			for (const [childKey, childValue] of Object.entries(inner)) mapped[childKey] = normalizeSurrealValue(childValue);
			return mapped;
		}
		if (key === "RecordId" && inner && typeof inner === "object") {
			const record = inner;
			const table = typeof record.table === "string" ? record.table : "unknown";
			const keyPart = normalizeSurrealValue(record.key);
			return `${table}:${String(keyPart)}`;
		}
		if (key === "Uuid" && typeof inner === "string") return inner;
	}
	const mapped = {};
	for (const [childKey, childValue] of Object.entries(obj)) mapped[childKey] = normalizeSurrealValue(childValue);
	return mapped;
}
function parseRecordId(input) {
	if (typeof input === "string" && input.includes(":")) {
		const [table, ...rest] = input.split(":");
		const key = rest.join(":");
		if (table && key) return new _RecordId(table, key);
	}
	return new _RecordId("unknown", "unknown");
}
function parseLiveAction(input) {
	const upper = input.toUpperCase();
	if (upper === "CREATE" || upper === "UPDATE" || upper === "DELETE" || upper === "KILLED") return upper;
	return "UPDATE";
}
var TauriEngine = class extends RpcEngine {
	#publisher = new Publisher();
	#sessionMap = /* @__PURE__ */ new Map();
	#liveChannels = /* @__PURE__ */ new Map();
	#liveEventChannels = /* @__PURE__ */ new Map();
	#liveStreamByQuery = /* @__PURE__ */ new Map();
	#active = false;
	features = new Set([
		Features.LiveQueries,
		Features.Sessions,
		Features.Transactions,
		Features.Api
	]);
	subscribe(event, listener) {
		return this.#publisher.subscribe(event, listener);
	}
	open(state) {
		this._state = state;
		this.#active = false;
		this.#sessionMap.clear();
		this.#liveChannels.clear();
		this.#liveEventChannels.clear();
		this.#liveStreamByQuery.clear();
		tauriDebug("open", "engine open requested", {
			namespace: state.rootSession.namespace,
			database: state.rootSession.database
		});
		(async () => {
			try {
				const rootSessionId = await invokeBridge("db_new_session");
				this.#sessionMap.set(ROOT_SESSION_KEY, rootSessionId);
				tauriDebug("open", "root session allocated", { rootSessionId });
				const { namespace, database } = state.rootSession;
				if (namespace !== void 0 || database !== void 0) {
					await invokeBridge("db_use_session", {
						sessionId: rootSessionId,
						namespace: namespace ?? null,
						database: database ?? null
					});
					tauriDebug("open", "root session namespace/database set", {
						namespace: namespace ?? null,
						database: database ?? null
					});
				}
				this.#active = true;
				tauriDebug("open", "engine connected");
				this.#publisher.publish("connected");
			} catch (error) {
				tauriDebug("open", "engine failed to connect", { error: asError(error).message });
				this.#publisher.publish("error", asError(error));
				this._state = void 0;
				this.#active = false;
				this.#publisher.publish("disconnected");
			}
		})();
	}
	async close() {
		this.#active = false;
		tauriDebug("close", "engine close requested", { liveStreamCount: this.#liveStreamByQuery.size });
		try {
			for (const [queryId, streamId] of this.#liveStreamByQuery.entries()) {
				try {
					await invokeBridge("db_live_unsubscribe", { streamId });
					tauriDebug("close", "live stream unsubscribed during close", {
						queryId,
						streamId
					});
				} catch {
					tauriDebug("close", "live stream unsubscribe failed during close", {
						queryId,
						streamId
					});
				}
				this.#liveChannels.get(queryId)?.cancel();
				this.#liveEventChannels.delete(queryId);
			}
			const backendSessionIds = new Set(this.#sessionMap.values());
			for (const sessionId of backendSessionIds) try {
				await invokeBridge("db_drop_session", { sessionId });
			} catch {}
		} finally {
			this.#sessionMap.clear();
			this.#liveChannels.clear();
			this.#liveEventChannels.clear();
			this.#liveStreamByQuery.clear();
			this._state = void 0;
			tauriDebug("close", "engine disconnected");
			this.#publisher.publish("disconnected");
		}
	}
	ready() {}
	async sessions() {
		return Array.from(this.#sessionMap.keys()).filter((key) => key !== ROOT_SESSION_KEY).map((key) => new Uuid(key));
	}
	async attach(session) {
		if (!this.#active) throw new ConnectionUnavailableError();
		const key = session.toString();
		if (this.#sessionMap.has(key)) {
			tauriDebug("session", "attach skipped, session already mapped", { session: key });
			return;
		}
		const backendSessionId = await invokeBridge("db_new_session");
		this.#sessionMap.set(key, backendSessionId);
		tauriDebug("session", "session attached", {
			session: key,
			backendSessionId
		});
	}
	async detach(session) {
		const key = session.toString();
		const backendSessionId = this.#sessionMap.get(key);
		if (!backendSessionId) return;
		await invokeBridge("db_drop_session", { sessionId: backendSessionId });
		this.#sessionMap.delete(key);
		tauriDebug("session", "session detached", {
			session: key,
			backendSessionId
		});
	}
	async use(what, session) {
		const backendSessionId = await this.#backendSession(session);
		if (what.namespace === void 0 && what.database === void 0) return {};
		await invokeBridge("db_use_session", {
			sessionId: backendSessionId,
			namespace: what.namespace ?? null,
			database: what.database ?? null
		});
		tauriDebug("session", "session namespace/database updated", {
			session: session ? session.toString() : ROOT_SESSION_KEY,
			backendSessionId,
			namespace: what.namespace ?? null,
			database: what.database ?? null
		});
		return {
			namespace: what.namespace ?? void 0,
			database: what.database ?? void 0
		};
	}
	async reset(session) {
		const backendSessionId = await this.#backendSession(session);
		await invokeBridge("db_use_session", {
			sessionId: backendSessionId,
			namespace: null,
			database: null
		});
		tauriDebug("session", "session reset", {
			session: session ? session.toString() : ROOT_SESSION_KEY,
			backendSessionId
		});
	}
	async set(name, value, session) {
		const backendSessionId = await this.#backendSession(session);
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new UnexpectedServerResponseError(`Invalid variable name: ${name}`);
		await invokeBridge("db_set_session_var", {
			sessionId: backendSessionId,
			name,
			value
		});
		tauriDebug("session", "session variable set", {
			session: session ? session.toString() : ROOT_SESSION_KEY,
			backendSessionId,
			variable: name
		});
	}
	async unset(name, session) {
		const backendSessionId = await this.#backendSession(session);
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new UnexpectedServerResponseError(`Invalid variable name: ${name}`);
		await invokeBridge("db_unset_session_var", {
			sessionId: backendSessionId,
			name
		});
		tauriDebug("session", "session variable unset", {
			session: session ? session.toString() : ROOT_SESSION_KEY,
			backendSessionId,
			variable: name
		});
	}
	async invalidate(session) {
		tauriDebug("session", "invalidate requested", { session: session ? session.toString() : ROOT_SESSION_KEY });
	}
	async begin(session) {
		const backendSessionId = await this.#backendSession(session);
		const txId = await invokeBridge("db_begin_transaction", { sessionId: backendSessionId });
		tauriDebug("tx", "transaction begun", {
			session: session ? session.toString() : ROOT_SESSION_KEY,
			backendSessionId,
			transactionId: txId
		});
		return new Uuid(txId);
	}
	async commit(txn, session) {
		const backendSessionId = await this.#backendSession(session);
		tauriDebug("tx", "transaction commit requested", {
			transactionId: txn.toString(),
			backendSessionId
		});
		await invokeBridge("db_commit_transaction", {
			sessionId: backendSessionId,
			transactionId: txn.toString()
		});
	}
	async cancel(txn, session) {
		const backendSessionId = await this.#backendSession(session);
		tauriDebug("tx", "transaction cancel requested", {
			transactionId: txn.toString(),
			backendSessionId
		});
		await invokeBridge("db_cancel_transaction", {
			sessionId: backendSessionId,
			transactionId: txn.toString()
		});
	}
	async *query(query, session, txn) {
		const queryType = queryTypeFromSql(query.query);
		tauriDebug("query", "dispatch", {
			type: queryType,
			session: session ? session.toString() : ROOT_SESSION_KEY,
			transaction: txn?.toString() ?? null,
			sql: compactSql(query.query),
			hasBindings: Boolean(query.bindings && Object.keys(query.bindings).length)
		});
		if (queryType === "live") {
			const fakeQueryId = Uuid.v7();
			const queryIdKey = fakeQueryId.toString();
			tauriDebug("live", "creating managed live subscription", { queryId: queryIdKey });
			const channel = new ChannelIterator(() => {
				const streamId = this.#liveStreamByQuery.get(queryIdKey);
				if (!streamId) return;
				invokeBridge("db_live_unsubscribe", { streamId }).catch(() => {
					tauriDebug("live", "unsubscribe during iterator cleanup failed", {
						queryId: queryIdKey,
						streamId
					});
				});
				tauriDebug("live", "iterator cleanup unsubscribe requested", {
					queryId: queryIdKey,
					streamId
				});
				this.#liveStreamByQuery.delete(queryIdKey);
				this.#liveChannels.delete(queryIdKey);
				this.#liveEventChannels.delete(queryIdKey);
			});
			const onEvent = new Channel();
			onEvent.onmessage = (message) => {
				tauriDebug("live:event", "incoming event", {
					queryId: queryIdKey,
					event: message.event,
					streamId: liveStreamIdFromEvent(message)
				});
				if (message.event === "started") return;
				if (message.event === "notification") {
					const payload = normalizeSurrealValue(message.data.data);
					const recordRaw = payload && typeof payload === "object" && "id" in payload ? payload.id : void 0;
					tauriDebug("live:event", "notification mapped", {
						queryId: queryIdKey,
						streamId: liveStreamIdFromEvent(message),
						backendQueryId: liveQueryIdFromEvent(message),
						action: message.data.action,
						recordId: typeof recordRaw === "string" ? recordRaw : null
					});
					channel.submit({
						queryId: fakeQueryId,
						action: parseLiveAction(message.data.action),
						recordId: parseRecordId(recordRaw),
						value: payload ?? {}
					});
					return;
				}
				if (message.event === "cancelled" || message.event === "finished") {
					tauriDebug("live:event", "stream closed", {
						queryId: queryIdKey,
						streamId: liveStreamIdFromEvent(message),
						event: message.event
					});
					channel.cancel();
					this.#liveChannels.delete(queryIdKey);
					this.#liveStreamByQuery.delete(queryIdKey);
					this.#liveEventChannels.delete(queryIdKey);
					return;
				}
				if (message.event === "failed") {
					const errorMessage = typeof message.data.error === "string" ? message.data.error : String(message.data.error);
					tauriDebug("live:event", "stream failed", {
						queryId: queryIdKey,
						streamId: liveStreamIdFromEvent(message),
						error: errorMessage
					});
					this.#publisher.publish("error", new Error(errorMessage));
					channel.cancel();
					this.#liveChannels.delete(queryIdKey);
					this.#liveStreamByQuery.delete(queryIdKey);
					this.#liveEventChannels.delete(queryIdKey);
				}
			};
			const backendSessionId = await this.#backendSession(session);
			const { sql: liveSql, bindings: liveBindings } = materializeLiveSqlWithBindings(query.query, query.bindings);
			if (liveSql !== query.query) tauriDebug("live", "normalized live sql", {
				queryId: queryIdKey,
				before: compactSql(query.query),
				after: compactSql(liveSql)
			});
			const streamId = await invokeBridge("db_live_subscribe", {
				sql: liveSql,
				vars: liveBindings ?? null,
				sessionId: backendSessionId,
				onEvent
			});
			tauriDebug("live", "live stream subscribed", {
				queryId: queryIdKey,
				streamId,
				backendSessionId
			});
			this.#liveChannels.set(queryIdKey, channel);
			this.#liveEventChannels.set(queryIdKey, onEvent);
			this.#liveStreamByQuery.set(queryIdKey, streamId);
			yield {
				query: 0,
				batch: 0,
				kind: "single",
				type: "live",
				result: [fakeQueryId],
				stats: {
					recordsReceived: 1,
					bytesReceived: -1,
					recordsScanned: -1,
					bytesScanned: -1,
					duration: new Duration("0ms")
				}
			};
			return;
		}
		if (queryType === "kill") {
			const maybeId = query.query.trim().split(/\s+/).at(1)?.replace(/;$/, "");
			if (maybeId) {
				const streamId = this.#liveStreamByQuery.get(maybeId);
				if (streamId) {
					tauriDebug("live", "kill requested", {
						queryId: maybeId,
						streamId
					});
					await invokeBridge("db_live_unsubscribe", { streamId });
					this.#liveStreamByQuery.delete(maybeId);
					this.#liveChannels.get(maybeId)?.cancel();
					this.#liveChannels.delete(maybeId);
					this.#liveEventChannels.delete(maybeId);
				}
			}
			yield {
				query: 0,
				batch: 0,
				kind: "single",
				type: "kill",
				result: [],
				stats: {
					recordsReceived: 0,
					bytesReceived: -1,
					recordsScanned: -1,
					bytesScanned: -1,
					duration: new Duration("0ms")
				}
			};
			return;
		}
		const backendSessionId = await this.#backendSession(session);
		const createUpsertMaterialized = materializeCreateUpsertSqlWithBindings(query.query, query.bindings ?? void 0);
		const materialized = materializeBoundIdentifierSqlWithBindings(createUpsertMaterialized.sql, createUpsertMaterialized.bindings);
		const response = await invokeBridge("db_query", {
			sql: materialized.sql,
			vars: materialized.bindings ?? null,
			sessionId: backendSessionId,
			transactionId: txn?.toString() ?? null
		});
		tauriDebug("query", "db_query response received", {
			chunkCount: response.chunks?.length ?? 0,
			session: session ? session.toString() : ROOT_SESSION_KEY,
			backendSessionId,
			transaction: txn?.toString() ?? null,
			sql: compactSql(materialized.sql)
		});
		for (const chunk of response.chunks ?? []) {
			const durationMs = Math.max(0, Number(chunk.executionTimeMs ?? 0));
			const resultValue = normalizeSurrealValue(chunk.result);
			if (chunk.error) {
				tauriDebug("query", "chunk error", {
					index: chunk.index,
					error: chunk.error
				});
				yield {
					query: chunk.index,
					batch: 0,
					kind: "single",
					error: new Error(chunk.error),
					stats: {
						recordsReceived: -1,
						bytesReceived: -1,
						recordsScanned: -1,
						bytesScanned: -1,
						duration: new Duration(`${durationMs}ms`)
					}
				};
				continue;
			}
			yield {
				query: chunk.index,
				batch: 0,
				kind: "single",
				type: "other",
				result: resultValue === void 0 ? [] : [resultValue],
				stats: {
					recordsReceived: Array.isArray(resultValue) ? resultValue.length : 1,
					bytesReceived: -1,
					recordsScanned: -1,
					bytesScanned: -1,
					duration: new Duration(`${durationMs}ms`)
				}
			};
		}
	}
	liveQuery(id) {
		const channel = this.#liveChannels.get(id.toString());
		if (!channel) throw new UnexpectedServerResponseError(`No live channel found for id ${id.toString()}`);
		return channel;
	}
	async send(request) {
		switch (request.method) {
			case "health":
				await invokeBridge("db_health");
				return;
			case "version": return await invokeBridge("db_version");
			default: throw new UnexpectedServerResponseError(`Method ${String(request.method)} is not supported by the tauri engine send() path`);
		}
	}
	async #backendSession(session) {
		if (!this.#active) throw new ConnectionUnavailableError();
		const key = sessionKey(session);
		const existing = this.#sessionMap.get(key);
		if (existing) {
			tauriDebug("session", "resolved existing backend session", {
				session: key,
				backendSessionId: existing
			});
			return existing;
		}
		if (session) {
			await this.attach(session);
			const created = this.#sessionMap.get(key);
			if (created) {
				tauriDebug("session", "resolved newly attached backend session", {
					session: key,
					backendSessionId: created
				});
				return created;
			}
		}
		throw new ConnectionUnavailableError();
	}
};
//#endregion
//#region src/types/live.ts
const LIVE_ACTIONS = [
	"CREATE",
	"UPDATE",
	"DELETE",
	"KILLED"
];
//#endregion
//#region src/engine/websocket.ts
/**
* An engine that communicates over WebSocket protocol
*/
var WebSocketEngine = class extends RpcEngine {
	#publisher = new Publisher();
	#socket;
	#calls = /* @__PURE__ */ new Map();
	#subscriptions = new Publisher();
	#pinger;
	#active = false;
	#terminated = false;
	features = new Set([
		Features.LiveQueries,
		Features.RefreshTokens,
		Features.Sessions,
		Features.Transactions,
		Features.Api,
		Features.ExportImportRaw,
		Features.SurrealML
	]);
	subscribe(event, listener) {
		return this.#publisher.subscribe(event, listener);
	}
	open(state) {
		this.#terminated = false;
		this._state = state;
		const { reconnect } = state;
		(async () => {
			while (!this.#terminated) {
				const error = await this.createSocket(() => {
					this.#active = true;
					reconnect.reset();
					this.#publisher.publish("connected");
				});
				this.#socket = void 0;
				if (error) this.#publisher.publish("error", error);
				if (this.#terminated || !reconnect.enabled || !reconnect.allowed) {
					if (reconnect.enabled && !reconnect.allowed) this.#publisher.publish("error", new ReconnectExhaustionError());
					if (!this.#terminated) for (const { reject } of this.#calls.values()) reject(new CallTerminatedError());
					this._state = void 0;
					this.#active = false;
					this.#calls.clear();
					this.#publisher.publish("disconnected");
					break;
				}
				if (error) reconnect.propagate(error);
				this.#publisher.publish("reconnecting");
				await reconnect.iterate();
			}
		})();
	}
	async close() {
		if (this.#terminated) return;
		const WebSocketImpl = this._context.options.websocketImpl ?? globalThis.WebSocket;
		const socketState = this.#socket?.readyState;
		this._state = void 0;
		this.#terminated = true;
		this.#socket?.close();
		if (socketState === WebSocketImpl.OPEN || socketState === WebSocketImpl.CLOSING) await this.#publisher.subscribeFirst("disconnected");
		else this.#publisher.publish("disconnected");
	}
	ready() {
		for (const { request } of this.#calls.values()) this.#socket?.send(this._context.codecs.cbor.encode(request));
	}
	send(request) {
		return new Promise((resolve, reject) => {
			if (!this.#active) {
				reject(new ConnectionUnavailableError());
				return;
			}
			const id = this._context.uniqueId();
			const call = {
				request: {
					id,
					...request
				},
				resolve,
				reject
			};
			this.#calls.set(id, call);
			this.#socket?.send(this._context.codecs.cbor.encode(call.request));
		});
	}
	liveQuery(id) {
		const channel = new ChannelIterator(() => {
			unsub1();
			unsub2();
		});
		const unsub1 = this.#subscriptions.subscribe(id.toString(), (msg) => {
			channel.submit(msg);
		});
		const unsub2 = this.#publisher.subscribe("disconnected", () => {
			channel.cancel();
		});
		return channel;
	}
	async createSocket(onConnected) {
		return new Promise((resolve, reject) => {
			if (!this._state) {
				reject(new ConnectionUnavailableError());
				return;
			}
			const socket = new (this._context.options.websocketImpl ?? globalThis.WebSocket)(this._state.url.toString(), "cbor");
			if (socket.binaryType === "blob") socket.binaryType = "arraybuffer";
			this.#socket = socket;
			let caughtError = null;
			socket.addEventListener("open", () => {
				try {
					onConnected();
					this.#pinger = setInterval(() => {
						try {
							this.send({ method: "ping" });
						} catch {}
					}, 3e4);
				} catch (err) {
					caughtError = err;
					socket.close();
				}
			});
			socket.addEventListener("error", (e) => {
				caughtError = new UnexpectedConnectionError("detail" in e && e.detail ? e.detail : "message" in e && e.message ? e.message : "error" in e && e.error ? e.error : "An unexpected error occurred");
			});
			socket.addEventListener("close", () => {
				clearInterval(this.#pinger);
				resolve(caughtError);
			});
			socket.addEventListener("message", ({ data }) => {
				try {
					const buffer = this.parseBuffer(data);
					const decoded = this._context.codecs.cbor.decode(buffer);
					if (typeof decoded === "object" && decoded != null && Object.getPrototypeOf(decoded) === Object.prototype) this.handleRpcResponse(decoded);
					else throw new UnexpectedServerResponseError(decoded);
				} catch (detail) {
					socket.dispatchEvent(new CustomEvent("error", { detail }));
				}
			});
		});
	}
	parseBuffer(data) {
		if (data instanceof Uint8Array) return data;
		if (data instanceof ArrayBuffer) return new Uint8Array(data);
		throw new UnexpectedServerResponseError(data);
	}
	handleRpcResponse({ id, ...res }) {
		if (typeof id === "string") {
			try {
				const response = res;
				const { resolve, reject } = this.#calls.get(id) ?? {};
				if (response.error) reject?.(parseRpcError(response.error));
				else resolve?.(response.result);
			} finally {
				this.#calls.delete(id);
			}
			return;
		}
		if (isLiveMessage(res.result)) {
			this.#subscriptions.publish(res.result.id.toString(), {
				queryId: res.result.id,
				action: res.result.action,
				recordId: res.result.record,
				value: res.result.result
			});
			return;
		}
		this.#publisher.publish("error", new UnexpectedServerResponseError(res));
	}
};
function isLiveMessage(v) {
	if (typeof v !== "object") return false;
	if (v === null) return false;
	if (!("id" in v && "action" in v && "result" in v && "record" in v)) return false;
	if (!(v.id instanceof Uuid)) return false;
	if (!LIVE_ACTIONS.includes(v.action)) return false;
	if (typeof v.result !== "object") return false;
	if (v.result === null) return false;
	if (!(v.record instanceof _RecordId)) return false;
	return true;
}
//#endregion
//#region src/engine/index.ts
/**
* Configure the `ws`, `wss`, `http`, and `https` remote engines for the JavaScript SDK.
*
* When engines are not explicitly configured, the JavaScript SDK will configure the
* remote engines by default.
*
* @example
* ```ts
* import { Surreal, createRemoteEngines } from "surrealdb";
*
* const db = new Surreal({
*     engines: createRemoteEngines(),
* });
* ```
*/
const createRemoteEngines = () => ({
	ws: (ctx) => new WebSocketEngine(ctx),
	wss: (ctx) => new WebSocketEngine(ctx),
	http: (ctx) => new HttpEngine(ctx),
	https: (ctx) => new HttpEngine(ctx)
});
/**
* Configure remote engines and add a tauri engine entry for embedded IPC transport.
*/
const createTauriEngines = () => ({
	...createRemoteEngines(),
	tauri: (ctx) => new TauriEngine(ctx)
});
/**
* This utility allows you to wrap engines and listen to internal communication
* within the SDK. Each operation is wrapped in a diagnostic event and emitted to the
* provided callback.
*
* Note that use of this utility is discouraged in production environments as it may
* hinder performance and is considered unstable, meaning diagnostic events may change between versions.
*
* @param engines The engine implementations to wrap.
* @param callback The callback to emit diagnostic events to.
* @returns The wrapped engine implementations.
*/
const applyDiagnostics = (engines, callback) => {
	return Object.fromEntries(Object.entries(engines).map(([key, factory]) => [key, (ctx) => new DiagnosticsEngine(factory(ctx), callback)]));
};
//#endregion
//#region src/internal/rand.ts
function rand(min, max) {
	return Math.random() * (max - min) + min;
}
//#endregion
//#region src/internal/reconnect.ts
const DEFAULT_RECONNECT_OPTIONS = {
	enabled: true,
	attempts: 5,
	retryDelay: 1e3,
	retryDelayMax: 6e4,
	retryDelayMultiplier: 2,
	retryDelayJitter: .1
};
var ReconnectContext = class {
	#attempts = 0;
	options;
	constructor(input) {
		if (!input) this.options = DEFAULT_RECONNECT_OPTIONS;
		else if (input === true) this.options = DEFAULT_RECONNECT_OPTIONS;
		else this.options = {
			...DEFAULT_RECONNECT_OPTIONS,
			...input
		};
	}
	get attempts() {
		return this.#attempts;
	}
	get enabled() {
		return this.options.enabled;
	}
	get allowed() {
		if (!this.options.enabled) return false;
		if (this.options.attempts !== -1 && this.#attempts >= this.options.attempts) return false;
		return true;
	}
	reset() {
		this.#attempts = 0;
	}
	propagate(error) {
		this.options.catch?.(error);
	}
	async iterate() {
		if (!this.allowed) throw new ReconnectIterationError();
		this.#attempts++;
		const multiplier = this.options.retryDelayMultiplier ** this.attempts;
		const adjustedDelay = this.options.retryDelay * multiplier;
		const jitterModifier = rand(-this.options.retryDelayJitter, this.options.retryDelayJitter);
		const nextDelay = Math.min(adjustedDelay * (1 + jitterModifier), this.options.retryDelayMax);
		await new Promise((r) => setTimeout(r, nextDelay));
	}
};
//#endregion
//#region src/internal/tokens.ts
function fastParseJwt(token) {
	try {
		const parts = token.split(".");
		if (parts.length !== 3) return null;
		return JSON.parse(atob(parts[1]));
	} catch {
		return null;
	}
}
//#endregion
//#region src/controller/index.ts
var ConnectionController = class {
	#eventPublisher = new Publisher();
	#context;
	#state;
	#engine;
	#nextEngine;
	#status = "disconnected";
	#authProvider;
	#cachedVersion;
	#skipRenewal = false;
	#checkVersion = false;
	subscribe(event, listener) {
		return this.#eventPublisher.subscribe(event, listener);
	}
	constructor(context) {
		this.#context = context;
	}
	get state() {
		return this.#state;
	}
	get status() {
		return this.#status;
	}
	propagateError(error) {
		this.#eventPublisher.publish("error", error);
	}
	async connect(url, options) {
		const engine = this.#instanceEngine(url);
		this.#nextEngine = engine;
		this.#status = "connecting";
		await this.disconnect();
		if (this.#nextEngine !== engine) return true;
		this.#engine = engine;
		this.#nextEngine = void 0;
		this.#authProvider = options.authentication;
		this.#skipRenewal = options.invalidateOnExpiry ?? false;
		this.#checkVersion = options.versionCheck ?? true;
		this.#state = {
			url,
			sessions: /* @__PURE__ */ new Map(),
			reconnect: new ReconnectContext(options.reconnect),
			rootSession: {
				...this.#createSessionState(void 0),
				namespace: options.namespace,
				database: options.database
			}
		};
		this.#engine.subscribe("connected", () => this.#onConnected());
		this.#engine.subscribe("disconnected", () => this.#onDisconnected());
		this.#engine.subscribe("reconnecting", () => this.#onReconnecting());
		this.#status = "connecting";
		this.#eventPublisher.publish("connecting");
		this.#engine.open(this.#state);
		await this.ready();
		return true;
	}
	async disconnect() {
		if (this.#engine) await this.#engine.close();
		return true;
	}
	async ready() {
		if (this.#status === "disconnected") throw new ConnectionUnavailableError();
		if (this.#status === "connected") return;
		const [result] = await this.#eventPublisher.subscribeFirst("connected", "error");
		if (result instanceof Error) throw result;
	}
	assertFeature(feature) {
		if (!this.#engine || !this.#cachedVersion) throw new ConnectionUnavailableError();
		if (!this.#engine.features.has(feature)) throw new UnsupportedFeatureError(feature);
		if (!feature.supports(this.#cachedVersion)) throw new UnavailableFeatureError(feature, this.#cachedVersion);
	}
	#instanceEngine(url) {
		const engineMap = this.#context.options.engines ?? createTauriEngines();
		const protocol = url.protocol.slice(0, -1);
		const factory = engineMap[protocol];
		if (!factory) throw new UnsupportedEngineError(protocol);
		return factory(this.#context);
	}
	health() {
		if (!this.#engine) throw new ConnectionUnavailableError();
		return this.#engine?.health();
	}
	version() {
		if (!this.#engine) throw new ConnectionUnavailableError();
		return this.#engine.version();
	}
	async sessions() {
		if (!this.#engine) throw new ConnectionUnavailableError();
		this.assertFeature(Features.Sessions);
		return this.#engine.sessions();
	}
	async attach(session) {
		if (!this.#engine) throw new ConnectionUnavailableError();
		this.assertFeature(Features.Sessions);
		await this.#engine.attach(session);
	}
	async detach(session) {
		if (!this.#engine) throw new ConnectionUnavailableError();
		this.assertFeature(Features.Sessions);
		return this.#engine.detach(session);
	}
	async signup(auth, session, skipOverride = false) {
		if (!this.#engine || !this.#state) throw new ConnectionUnavailableError();
		const response = await this.#engine.signup(auth, session);
		const sessionState = this.getSession(session);
		sessionState.accessToken = response.access;
		sessionState.refreshToken = response.refresh;
		sessionState.authOverriden = sessionState.authOverriden || !skipOverride;
		this.#handleAuthChanged(session);
		return response;
	}
	async signin(auth, session, skipOverride = false) {
		if (!this.#engine || !this.#state) throw new ConnectionUnavailableError();
		const response = await this.#engine.signin(auth, session);
		const sessionState = this.getSession(session);
		sessionState.accessToken = response.access;
		sessionState.refreshToken = response.refresh;
		sessionState.authOverriden = sessionState.authOverriden || !skipOverride;
		this.#handleAuthChanged(session);
		return response;
	}
	async authenticate(token, session, skipOverride = false) {
		if (!this.#engine || !this.#state) throw new ConnectionUnavailableError();
		await this.#engine.authenticate(token, session);
		const sessionState = this.getSession(session);
		sessionState.accessToken = token;
		sessionState.authOverriden = sessionState.authOverriden || !skipOverride;
		this.#handleAuthChanged(session);
	}
	async refresh(tokens, session, skipOverride = false) {
		if (!this.#engine || !this.#state) throw new ConnectionUnavailableError();
		this.assertFeature(Features.RefreshTokens);
		const response = await this.#engine.refresh(tokens, session);
		const sessionState = this.getSession(session);
		sessionState.accessToken = response.access;
		sessionState.refreshToken = response.refresh;
		sessionState.authOverriden = sessionState.authOverriden || !skipOverride;
		this.#handleAuthChanged(session);
		return response;
	}
	async revoke(tokens, session) {
		if (!this.#engine || !this.#state) throw new ConnectionUnavailableError();
		this.assertFeature(Features.RefreshTokens);
		await this.#engine.revoke(tokens, session);
	}
	async use(what, session) {
		if (!this.#engine || !this.#state) throw new ConnectionUnavailableError();
		if (what.namespace === null && what.database !== null) throw new MissingNamespaceDatabaseError();
		const res = await this.#engine.use(what, session);
		const namespace = res.namespace ?? what.namespace;
		const database = res.database ?? what.database;
		const sessionState = this.getSession(session);
		if (namespace === null) sessionState.namespace = void 0;
		if (database === null) sessionState.database = void 0;
		if (namespace) sessionState.namespace = namespace;
		if (database) sessionState.database = database;
		const selected = {
			namespace: sessionState.namespace,
			database: sessionState.database
		};
		this.#eventPublisher.publish("using", selected, session);
		return selected;
	}
	async set(name, value, session) {
		if (!this.#engine || !this.#state) throw new ConnectionUnavailableError();
		await this.#engine.set(name, value, session);
		const sessionState = this.getSession(session);
		sessionState.variables[name] = value;
	}
	async unset(name, session) {
		if (!this.#engine || !this.#state) throw new ConnectionUnavailableError();
		await this.#engine.unset(name, session);
		const sessionState = this.getSession(session);
		delete sessionState.variables[name];
	}
	async invalidate(session) {
		if (!this.#engine) throw new ConnectionUnavailableError();
		await this.#engine.invalidate(session);
		this.#handleAuthInvalidate(session);
	}
	async reset(session) {
		if (!this.#engine || !this.#state) throw new ConnectionUnavailableError();
		await this.#engine.reset(session);
		const sessionState = this.getSession(session);
		sessionState.namespace = void 0;
		sessionState.database = void 0;
		sessionState.variables = {};
		this.#handleAuthInvalidate(session);
		this.#eventPublisher.publish("using", {
			namespace: void 0,
			database: void 0
		}, session);
	}
	begin(session) {
		if (!this.#engine) throw new ConnectionUnavailableError();
		this.assertFeature(Features.Transactions);
		return this.#engine.begin(session);
	}
	commit(txn, session) {
		if (!this.#engine) throw new ConnectionUnavailableError();
		this.assertFeature(Features.Transactions);
		return this.#engine.commit(txn, session);
	}
	cancel(txn, session) {
		if (!this.#engine) throw new ConnectionUnavailableError();
		this.assertFeature(Features.Transactions);
		return this.#engine.cancel(txn, session);
	}
	importSql(data) {
		if (!this.#engine) throw new ConnectionUnavailableError();
		if (data instanceof ReadableStream || data instanceof Blob) this.assertFeature(Features.ExportImportRaw);
		return this.#engine.importSql(data);
	}
	exportSql(options) {
		if (!this.#engine) throw new ConnectionUnavailableError();
		return this.#engine.exportSql(options);
	}
	exportMlModel(options) {
		if (!this.#engine) throw new ConnectionUnavailableError();
		return this.#engine.exportMlModel(options);
	}
	query(query, session, txn) {
		if (!this.#engine) throw new ConnectionUnavailableError();
		return this.#engine.query(query, session, txn);
	}
	liveQuery(id) {
		if (!this.#engine) throw new ConnectionUnavailableError();
		return this.#engine.liveQuery(id);
	}
	async #onConnected() {
		try {
			const { version } = await this.version();
			this.#cachedVersion = version;
			if (this.#checkVersion && !isVersionSupported(version)) throw new UnsupportedVersionError(version, MINIMUM_VERSION, MAXIMUM_VERSION);
			for (const session of this.#allSessions()) {
				if (session.id) await this.attach(session.id);
				await this.#restoreSession(session);
			}
			this.#engine?.ready();
			this.#status = "connected";
			this.#eventPublisher.publish("connected", version);
		} catch (err) {
			this.#eventPublisher.publish("error", err);
			this.#engine?.close();
			return;
		}
	}
	#onDisconnected() {
		for (const session of this.#allSessions()) this.#cancelAuthRenewal(session.id);
		this.#state = void 0;
		this.#engine = void 0;
		this.#status = "disconnected";
		this.#eventPublisher.publish("disconnected");
	}
	#onReconnecting() {
		this.#status = "reconnecting";
		this.#eventPublisher.publish("reconnecting");
	}
	#getTokens(session) {
		const sessionState = this.getSession(session);
		if (!sessionState.accessToken) return;
		return {
			access: sessionState.accessToken,
			refresh: sessionState.refreshToken
		};
	}
	async #applyAuthProvider(session) {
		const provider = this.#authProvider;
		if (!provider) return false;
		const computed = typeof provider === "function" ? await provider(session) : provider;
		if (computed === null) return false;
		if (typeof computed === "string") await this.authenticate(computed, session, true);
		else await this.signin(computed, session, true);
		return true;
	}
	#cancelAuthRenewal(session) {
		if (!this.#state) return;
		const sessionState = this.getSession(session);
		if (!sessionState.authRenewal) return;
		clearTimeout(sessionState.authRenewal);
		sessionState.authRenewal = void 0;
	}
	#handleAuthChanged(session) {
		if (!this.#state) return;
		const sessionState = this.getSession(session);
		const tokens = this.#getTokens(session);
		if (!tokens) return;
		this.#cancelAuthRenewal(session);
		this.#eventPublisher.publish("auth", tokens, session);
		const payload = fastParseJwt(tokens.access);
		if (!payload || !payload.exp) return;
		const now = Math.floor(Date.now() / 1e3);
		const delay = Math.max((payload.exp - now - 60) * 1e3, 0);
		sessionState.authRenewal = setTimeout(() => {
			this.#applyAuthentication(session).catch((err) => {
				this.#eventPublisher.publish("error", new AuthenticationError(err));
			});
		}, delay);
	}
	async #abortAuthentication(session) {
		if (!this.#state) return;
		if (this.getSession(session).accessToken) await this.invalidate(session);
	}
	async #applyAuthentication(session) {
		const sessionState = this.getSession(session);
		if (this.#skipRenewal) {
			await this.#abortAuthentication(session);
			return;
		}
		if (sessionState.accessToken) {
			const payload = fastParseJwt(sessionState.accessToken);
			if (payload?.exp) {
				const now = Math.floor(Date.now() / 1e3);
				if (payload.exp - now > 60) try {
					await this.authenticate(sessionState.accessToken, session, true);
					return;
				} catch (err) {
					if (!(err instanceof ServerError)) throw err;
				}
			}
		}
		if (sessionState.refreshToken) {
			const tokens = this.#getTokens(session);
			if (tokens) try {
				await this.refresh(tokens, session, true);
				return;
			} catch (err) {
				if (!(err instanceof ServerError)) throw err;
			}
		}
		if (!sessionState.authOverriden) {
			if (await this.#applyAuthProvider(session)) return;
		}
		await this.#abortAuthentication(session);
	}
	#handleAuthInvalidate(session) {
		if (!this.#state) return;
		const sessionState = this.getSession(session);
		sessionState.accessToken = void 0;
		sessionState.refreshToken = void 0;
		this.#cancelAuthRenewal(session);
		this.#eventPublisher.publish("auth", null, session);
	}
	hasSession(session) {
		if (!this.#state) return false;
		if (session === void 0) return true;
		return this.#state.sessions.has(session);
	}
	getSession(session) {
		if (!this.#state) throw new ConnectionUnavailableError();
		return getSessionFromState(this.#state, session);
	}
	async createSession(clone) {
		if (!this.#state) throw new ConnectionUnavailableError();
		this.assertFeature(Features.Sessions);
		const sessionId = Uuid.v4();
		await this.attach(sessionId);
		if (clone === null) this.#state.sessions.set(sessionId, this.#createSessionState(sessionId));
		else {
			const state = this.#cloneSessionState(sessionId, clone);
			this.#state.sessions.set(sessionId, state);
			await this.#restoreSession(state);
		}
		return sessionId;
	}
	async destroySession(session) {
		if (!this.#state) throw new ConnectionUnavailableError();
		if (!session || !this.#state.sessions.has(session)) throw new InvalidSessionError(session);
		await this.detach(session);
		this.#state.sessions.delete(session);
	}
	#allSessions() {
		if (!this.#state) return [];
		return [this.#state.rootSession, ...Array.from(this.#state.sessions.values())];
	}
	#createSessionState(id) {
		return {
			id,
			variables: {},
			namespace: void 0,
			database: void 0,
			accessToken: void 0,
			refreshToken: void 0,
			authRenewal: void 0,
			authOverriden: false
		};
	}
	#cloneSessionState(newId, existingId) {
		const state = this.getSession(existingId);
		return {
			id: newId,
			variables: { ...state.variables },
			namespace: state.namespace,
			database: state.database,
			accessToken: state.accessToken,
			refreshToken: state.refreshToken,
			authRenewal: void 0,
			authOverriden: false
		};
	}
	async #restoreSession(session) {
		if (session.namespace || session.database) {
			const what = {
				namespace: session.namespace,
				database: session.database
			};
			await this.use(what, session.id);
		}
		for (const [name, value] of Object.entries(session.variables)) await this.set(name, value, session.id);
		await this.#applyAuthentication(session.id);
	}
};
//#endregion
//#region src/flatbuffer/codec.ts
/**
* A class used to encode and decode SurrealQL values using FlatBuffers
*/
var FlatBufferCodec = class {
	#options;
	constructor(options) {
		this.#options = options;
	}
	encode(_data) {
		throw new SurrealError("FlatBuffer encoding is not supported in this version");
	}
	decode(_data) {
		throw new SurrealError("FlatBuffer decoding is not supported in this version");
	}
};
//#endregion
//#region src/api/surreal.ts
/**
* The Surreal class provides methods to connect to a SurrealDB instance,
* execute database queries, subscribe to events, and manage database sessions.
*
* Note that most methods in this class are dispatched once you subscribe to the
* returned Promise and offer various chainable configuration methods before
* making the actual request.
*
* By default the Surreal instance is scoped to a default session, however you
* can create a new session by calling the `newSession` or `forkSession` methods.
*/
var Surreal = class Surreal extends SurrealSession {
	#publisher = new Publisher();
	#connection;
	subscribe(event, listener) {
		return this.#publisher.subscribe(event, listener);
	}
	/**
	* Construct a new Surreal instance with the provided options
	*
	* @param options Driver wide configuration options
	*/
	constructor(options) {
		const driverOptions = options ?? {};
		const connection = new ConnectionController({
			options: driverOptions,
			uniqueId: getIncrementalID,
			codecs: Surreal.#compileCodecs(driverOptions)
		});
		super(connection, void 0);
		connection.subscribe("connecting", () => {
			this.#publisher.publish("connecting");
		});
		connection.subscribe("connected", (version) => {
			this.#publisher.publish("connected", version);
		});
		connection.subscribe("disconnected", () => {
			this.#publisher.publish("disconnected");
		});
		connection.subscribe("reconnecting", () => {
			this.#publisher.publish("reconnecting");
		});
		connection.subscribe("error", (error) => {
			this.#publisher.publish("error", error);
		});
		super.subscribe("auth", (token) => {
			this.#publisher.publish("auth", token);
		});
		super.subscribe("using", (using) => {
			this.#publisher.publish("using", using);
		});
		this.#connection = connection;
	}
	static #compileCodecs(options) {
		const userCodecs = options.codecs ?? {};
		const codecOptions = options.codecOptions ?? {};
		return {
			cbor: userCodecs.cbor?.(codecOptions) ?? new CborCodec(codecOptions),
			flatbuffer: userCodecs.flatbuffer?.(codecOptions) ?? new FlatBufferCodec(codecOptions)
		};
	}
	/**
	* Returns the status of the connection
	*/
	get status() {
		return this.#connection.status;
	}
	/**
	* Returns whether the connection is considered connected
	*
	* Equivalent to `this.status === "connected"`
	*/
	get isConnected() {
		return this.#connection.status === "connected";
	}
	/**
	* A promise which resolves when the connection is ready, or rejects
	* if a connection error occurs.
	*/
	get ready() {
		return this.#connection.ready();
	}
	/**
	* Connect to a local or remote SurrealDB instance using the provided URL.
	*
	* Calling `connect()` will reset and dispose any existing sessions created with `newSession()`.
	*
	* @param url The endpoint to connect to
	* @param opts Options to configure the connection
	*/
	async connect(url, opts = {}) {
		return this.#connection.connect(parseEndpoint(url), opts);
	}
	/**
	* Disconnect from the active SurrealDB instance
	*/
	async close() {
		return this.#connection.disconnect();
	}
	/**
	* Check the health of the connected SurrealDB instance
	*
	* @returns The health of the connected SurrealDB instance
	*/
	health() {
		return this.#connection.health();
	}
	/**
	* Retrieves the version of the connected SurrealDB instance
	*
	* @example { version: "surrealdb-2.1.0" }
	*/
	version() {
		return this.#connection.version();
	}
	/**
	* Checks whether a feature is available in the current connection
	*
	* @param feature The feature to check
	*/
	isFeatureSupported(feature) {
		try {
			this.#connection.assertFeature(feature);
			return true;
		} catch (error) {
			if (error instanceof UnavailableFeatureError || error instanceof UnsupportedFeatureError) return false;
			throw error;
		}
	}
	/**
	* Lists all sessions created on the current connection.
	*
	* @returns A list of active session IDs
	*/
	sessions() {
		return this.#connection.sessions();
	}
	/**
	* Create a fresh new session on this connection and return a dedicated `Surreal` instance scoped to it.
	*
	* This session will contain its own copy of global variables, namespace, database, and authentication state.
	* Connection related functions and event subscriptions will be shared with the original session. When the
	* connection reconnects, the session will be automatically restored.
	*
	* You can invoke `reset()` on the created session to destroy it, after which it cannot be used again.
	*
	* @returns The new session
	*/
	async newSession() {
		const created = await this.#connection.createSession(null);
		return SurrealSession.of(this, created);
	}
	/**
	* Stop the primary session. This is equivalent to calling `close()` on the connection.
	*/
	async closeSession() {
		await this.close();
	}
	/**
	* Import an existing export into the database
	*
	* @param input The data to import
	*/
	async import(input) {
		await this.ready;
		return this.#connection.importSql(input);
	}
	/**
	* Export the database as SurrealQL.
	*
	* By default, the result is returned as a string. Chain `.response()`
	* to receive the raw `Response` instead.
	*
	* @param options Optional export options
	*/
	export(options) {
		return new ExportPromise(this.#connection, options ?? {}, false);
	}
	/**
	* Export a SurrealML model.
	*
	* By default, the result is returned as a `Uint8Array`. Chain `.response()`
	* to receive the raw `Response` instead.
	*
	* @param name The name of the ML model to export
	* @param version The version of the ML model to export
	*/
	exportModel(name, version) {
		return new ExportModelPromise(this.#connection, {
			name,
			version
		}, false);
	}
};
//#endregion
exports.AlreadyExistsError = AlreadyExistsError;
exports.AuthenticationError = AuthenticationError;
exports.BoundExcluded = BoundExcluded;
exports.BoundIncluded = BoundIncluded;
exports.BoundQuery = BoundQuery;
exports.CallTerminatedError = CallTerminatedError;
exports.CborCodec = CborCodec;
exports.ChannelIterator = ChannelIterator;
exports.ConfigurationError = ConfigurationError;
exports.ConnectionUnavailableError = ConnectionUnavailableError;
exports.DateTime = DateTime;
exports.Decimal = Decimal;
exports.DoneFrame = DoneFrame;
exports.Duration = Duration;
exports.ErrorFrame = ErrorFrame;
exports.ErrorKind = ErrorKind;
exports.ExportModelPromise = ExportModelPromise;
exports.ExportPromise = ExportPromise;
exports.ExpressionError = ExpressionError;
exports.Features = Features;
exports.FileRef = FileRef;
exports.Frame = Frame;
exports.Future = Future;
exports.Geometry = Geometry;
exports.GeometryCollection = GeometryCollection;
exports.GeometryLine = GeometryLine;
exports.GeometryMultiLine = GeometryMultiLine;
exports.GeometryMultiPoint = GeometryMultiPoint;
exports.GeometryMultiPolygon = GeometryMultiPolygon;
exports.GeometryPoint = GeometryPoint;
exports.GeometryPolygon = GeometryPolygon;
exports.HttpConnectionError = HttpConnectionError;
exports.HttpEngine = HttpEngine;
exports.InternalError = InternalError;
exports.InvalidDateError = InvalidDateError;
exports.InvalidDecimalError = InvalidDecimalError;
exports.InvalidDurationError = InvalidDurationError;
exports.InvalidRecordIdError = InvalidRecordIdError;
exports.InvalidSessionError = InvalidSessionError;
exports.InvalidTableError = InvalidTableError;
exports.LIVE_ACTIONS = LIVE_ACTIONS;
exports.LiveSubscription = LiveSubscription;
exports.LiveSubscriptionError = LiveSubscriptionError;
exports.MAXIMUM_VERSION = MAXIMUM_VERSION;
exports.MINIMUM_VERSION = MINIMUM_VERSION;
exports.ManagedLiveSubscription = ManagedLiveSubscription;
exports.MissingNamespaceDatabaseError = MissingNamespaceDatabaseError;
exports.NotAllowedError = NotAllowedError;
exports.NotFoundError = NotFoundError;
exports.PublishError = PublishError;
exports.Publisher = Publisher;
exports.QueryError = QueryError;
exports.Range = Range;
exports.ReconnectExhaustionError = ReconnectExhaustionError;
exports.ReconnectIterationError = ReconnectIterationError;
exports.RecordId = _RecordId;
exports.RecordIdRange = _RecordIdRange;
exports.ResponseError = ResponseError;
exports.RpcEngine = RpcEngine;
exports.SerializationError = SerializationError;
exports.ServerError = ServerError;
exports.StringRecordId = StringRecordId;
exports.Surreal = Surreal;
exports.SurrealApi = SurrealApi;
exports.SurrealError = SurrealError;
exports.SurrealQueryable = SurrealQueryable;
exports.SurrealSession = SurrealSession;
exports.SurrealTransaction = SurrealTransaction;
exports.Table = Table;
exports.TauriEngine = TauriEngine;
exports.ThrownError = ThrownError;
exports.UnavailableFeatureError = UnavailableFeatureError;
exports.UnexpectedConnectionError = UnexpectedConnectionError;
exports.UnexpectedServerResponseError = UnexpectedServerResponseError;
exports.UnmanagedLiveSubscription = UnmanagedLiveSubscription;
exports.UnsuccessfulApiError = UnsuccessfulApiError;
exports.UnsupportedEngineError = UnsupportedEngineError;
exports.UnsupportedFeatureError = UnsupportedFeatureError;
exports.UnsupportedVersionError = UnsupportedVersionError;
exports.Uuid = Uuid;
exports.ValidationError = ValidationError;
exports.Value = Value;
exports.ValueFrame = ValueFrame;
exports.WebSocketEngine = WebSocketEngine;
exports.and = and;
exports.applyDiagnostics = applyDiagnostics;
exports.between = between;
exports.contains = contains;
exports.containsAll = containsAll;
exports.containsAny = containsAny;
exports.containsNone = containsNone;
exports.createRemoteEngines = createRemoteEngines;
exports.createTauriEngines = createTauriEngines;
exports.d = d;
exports.eeq = eeq;
exports.eq = eq;
exports.equals = equals;
exports.escapeIdPart = escapeIdPart;
exports.escapeIdent = escapeIdent;
exports.escapeNumber = escapeNumber;
exports.escapeRangeBound = escapeRangeBound;
exports.expr = expr;
exports.getBucketFolderAllowlist = getBucketFolderAllowlist;
exports.gt = gt;
exports.gte = gte;
exports.inside = inside;
exports.intersects = intersects;
exports.isVersionSupported = isVersionSupported;
exports.jsonify = jsonify;
exports.knn = knn;
exports.lt = lt;
exports.lte = lte;
exports.matches = matches;
exports.mergeBindings = mergeBindings;
exports.ne = ne;
exports.not = not;
exports.or = or;
exports.outside = outside;
exports.parseRpcError = parseRpcError;
exports.r = r;
exports.raw = raw;
exports.s = s;
exports.surql = surql;
exports.toSurqlString = toSurqlString;
exports.toSurrealqlString = toSurqlString;
exports.u = u;
