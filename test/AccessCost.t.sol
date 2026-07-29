// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import "forge-std/Test.sol";

/// Quantify the EIP-2929 access-cost asymmetry between the EIP-7951 precompile (0x100)
/// and the OLD Solidity verifier, which lives at an ordinary contract address.
/// If 0x100 is pre-warmed and the old verifier is not, delta_gas carries a fixed
/// ~2,500 gas component that has nothing to do with the cryptography.
contract AccessCost is Test {
    address constant P256     = address(0x100);
    address constant OLD_VER  = 0x0faa24e538bA4620165933f68a9d142f79A68091; // current-oracle old alg-13
    address constant LEG_VER  = 0xe571A50F76ff7404F3Ce380D06CBd2c9c6Ca3670; // legacy-oracle old alg-13
    address constant UNTOUCHED= 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e; // ENS registry, as a control

    function _probe(address a) internal view returns (uint256 first, uint256 second) {
        uint256 g0 = gasleft();
        (bool s1,) = a.staticcall(hex"00");
        first = g0 - gasleft();
        uint256 g1 = gasleft();
        (bool s2,) = a.staticcall(hex"00");
        second = g1 - gasleft();
        s1; s2;
    }

    function test_accessCostAsymmetry() public view {
        (uint256 p1, uint256 p2) = _probe(P256);
        console.log("precompile 0x100    1st:", p1, " 2nd:", p2);
        (uint256 o1, uint256 o2) = _probe(OLD_VER);
        console.log("old verifier (contr) 1st:", o1, " 2nd:", o2);
        (uint256 l1, uint256 l2) = _probe(LEG_VER);
        console.log("legacy verifier      1st:", l1, " 2nd:", l2);
        (uint256 u1, uint256 u2) = _probe(UNTOUCHED);
        console.log("ENS registry (control) 1st:", u1, " 2nd:", u2);
        console.log("--- cold-access premium (1st minus 2nd) ---");
        console.log("0x100        :", p1 - p2);
        console.log("old verifier :", o1 - o2);
        console.log("legacy ver.  :", l1 - l2);
        console.log("registry     :", u1 - u2);
    }
}
