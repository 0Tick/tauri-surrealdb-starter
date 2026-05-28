use std::fmt::Display;

use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum BridgeError {
    #[error("io error: {0}")]
    Io(String),
    #[error("database error: {0}")]
    Database(String),
    #[error("connection not found: {0}")]
    ConnectionNotFound(u32),
    #[error("transport error: {0}")]
    Transport(String),
    #[error("serialization error: {0}")]
    Serialization(String),
    #[error("runtime error: {0}")]
    Runtime(String),
}

pub(crate) fn map_io_error<E: Display>(error: E) -> BridgeError {
    BridgeError::Io(error.to_string())
}

pub(crate) fn map_db_error<E: Display>(error: E) -> BridgeError {
    BridgeError::Database(error.to_string())
}

pub(crate) fn map_transport_error<E: Display>(error: E) -> BridgeError {
    BridgeError::Transport(error.to_string())
}

pub(crate) fn map_serialization_error<E: Display>(error: E) -> BridgeError {
    BridgeError::Serialization(error.to_string())
}

pub(crate) fn map_runtime_error<E: Display>(error: E) -> BridgeError {
    BridgeError::Runtime(error.to_string())
}