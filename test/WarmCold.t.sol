// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import "forge-std/Test.sol";

/// Independent reference measurement: is EIP-7951 precompile 0x100 pre-warmed
/// under EIP-2929, and what does one verification actually cost in situ?
contract WarmCold is Test {
    address constant P256 = address(0x100);
    // RFC 6605 alg-13 vector (from ens-contracts fixtures), 160-byte precompile input
    bytes constant INPUT = hex"f3c3fc2bc93f926c16c726097de5bcafec49792d10effc432d4d03bc6aef54fe"
        hex"ab1eb02d8aa687e97da0229337aa8873e6f0eb26be289f28333d183f5d3b7a95"
        hex"c0c869adfb748daee3c5286eed6682c12e5533186baced9c26c167a9ebae950b"
        hex"1a88c88615d437fbb8bf9e1942a1929f28562706ae6c2bd399e7b1bfb6d1e9e7"
        hex"5b92b4aa42917ae1c61b701ef035c3fe7be3009cbafe5a2f71316c902dcf0d00";

    function _call() internal view returns (bool ok, uint256 used) {
        uint256 g0 = gasleft();
        (bool s, bytes memory out) = P256.staticcall(INPUT);
        used = g0 - gasleft();
        ok = s && out.length == 32 && out[31] == 0x01;
    }

    function test_firstAccess_vs_secondAccess() public view {
        (bool ok1, uint256 g1) = _call();
        (bool ok2, uint256 g2) = _call();
        (bool ok3, uint256 g3) = _call();
        console.log("valid signature verified:", ok1 && ok2 && ok3);
        console.log("1st access gas (cold?):", g1);
        console.log("2nd access gas (warm):", g2);
        console.log("3rd access gas (warm):", g3);
        console.log("cold-warm delta:", g1 > g2 ? g1 - g2 : 0);
        assertTrue(ok1, "RFC6605 alg-13 vector must verify through EIP-7951");
    }

    function test_invalidSignature_returnsEmpty() public view {
        bytes memory bad = INPUT;
        bad[32] = bytes1(uint8(bad[32]) ^ 0xff);
        (bool s, bytes memory out) = P256.staticcall(bad);
        console.log("invalid: success =", s, " returndata len =", out.length);
        assertEq(out.length, 0, "EIP-7951 returns empty bytes for invalid signature");
    }
}
