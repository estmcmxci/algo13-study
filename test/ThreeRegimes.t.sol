// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import "forge-std/Test.sol";
interface IAlg { function verify(bytes calldata k, bytes calldata d, bytes calldata s) external view returns (bool); }

/// Three cost regimes, not two: the legacy-oracle verifier is a DIFFERENT and more
/// expensive implementation than the current-oracle one. Pooling them would blend
/// two distinct old-side costs across 62% / 38% of the population.
contract ThreeRegimes is Test {
    address constant SLOT = 0x00000000000000000000000000000000DeaDBeef;
    address constant OLD_CUR = 0x0faa24e538bA4620165933f68a9d142f79A68091;
    address constant OLD_LEG = 0xe571A50F76ff7404F3Ce380D06CBd2c9c6Ca3670;
    address constant NEWV    = 0xB091C4F6FAc16eDDA5Ee1E0f4738f80011905878;
    bytes KEY = hex"0101030d1a88c88615d437fbb8bf9e1942a1929f28562706ae6c2bd399e7b1bfb6d1e9e75b92b4aa42917ae1c61b701ef035c3fe7be3009cbafe5a2f71316c902dcf0d00";
    bytes DATA= hex"00010d0300000e104c88b1374c63c737d960076578616d706c65036e65740003777777076578616d706c65036e6574000001000100000e100004c0000201";
    bytes SIG = hex"ab1eb02d8aa687e97da0229337aa8873e6f0eb26be289f28333d183f5d3b7a95c0c869adfb748daee3c5286eed6682c12e5533186baced9c26c167a9ebae950b";

    function _g(address src) internal returns (uint256 g, bool ok) {
        vm.etch(SLOT, src.code);
        IAlg(SLOT).verify(KEY, DATA, SIG);          // warm
        uint256 a = gasleft();
        ok = IAlg(SLOT).verify(KEY, DATA, SIG);
        g = a - gasleft();
    }
    function test_threeRegimes() public {
        (uint256 gCur, bool a) = _g(OLD_CUR);
        (uint256 gLeg, bool b) = _g(OLD_LEG);
        (uint256 gNew, bool c) = _g(NEWV);
        console.log("OLD current-oracle 0x0faa24e5:", gCur);
        console.log("OLD legacy-oracle  0xe571a50f:", gLeg);
        console.log("NEW                0xb091c4f6:", gNew);
        console.log("delta current-old - new:", gCur - gNew);
        console.log("delta legacy-old  - new:", gLeg - gNew);
        console.log("legacy is more expensive than current by:", gLeg - gCur);
        assertTrue(a && b && c, "all three must verify");
    }
}
