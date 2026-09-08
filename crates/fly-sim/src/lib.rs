use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn sim_abi_version() -> u32 {
    1
}

#[cfg(test)]
mod tests {
    #[test]
    fn abi_version_is_one() {
        assert_eq!(super::sim_abi_version(), 1);
    }
}
