// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import "forge-std/Test.sol";

/// Does the EIP-2929 cold-access premium actually appear in delta_gas?
/// The REAL comparison is not "contract vs precompile". Both the old and the new
/// algorithm-13 verifiers are CONTRACTS sitting at the oracle's algorithms(13) slot;
/// the new one merely staticcalls 0x100 internally. So both sides should pay the
/// same cold-access charge, and it should cancel in the difference.
interface IAlg { function verify(bytes calldata key, bytes calldata data, bytes calldata sig) external view returns (bool); }

contract RealPair is Test {
    address constant OLD = 0x0faa24e538bA4620165933f68a9d142f79A68091;
    address constant NEW = 0xB091C4F6FAc16eDDA5Ee1E0f4738f80011905878;
    address constant SLOT = 0x00000000000000000000000000000000DeaDBeef; // same address, both variants

    bytes KEY = hex"0101030d1a88c88615d437fbb8bf9e1942a1929f28562706ae6c2bd399e7b1bfb6d1e9e75b92b4aa42917ae1c61b701ef035c3fe7be3009cbafe5a2f71316c902dcf0d00";
    bytes DATA= hex"00010d0300000e104c88b1374c63c737d960076578616d706c65036e65740003777777076578616d706c65036e6574000001000100000e100004c0000201";
    bytes SIG = hex"ab1eb02d8aa687e97da0229337aa8873e6f0eb26be289f28333d183f5d3b7a95c0c869adfb748daee3c5286eed6682c12e5533186baced9c26c167a9ebae950b";

    function _measure(bytes memory code, bool secondCall) internal returns (uint256 g, bool ok) {
        vm.etch(SLOT, code);
        if (secondCall) { IAlg(SLOT).verify(KEY, DATA, SIG); } // warm it
        uint256 g0 = gasleft();
        ok = IAlg(SLOT).verify(KEY, DATA, SIG);
        g = g0 - gasleft();
    }

    function test_pairedDelta_atSameAddress() public {
        bytes memory oldCode = OLD.code;
        bytes memory newCode = NEW.code;
        console.log("old verifier code size:", oldCode.length);
        console.log("new verifier code size:", newCode.length);

        (uint256 gOldCold, bool okOld) = _measure(oldCode, false);
        (uint256 gNewCold, bool okNew) = _measure(newCode, false);
        console.log("--- FIRST (cold) access at the same slot address ---");
        console.log("old cold:", gOldCold, " verified:", okOld);
        console.log("new cold:", gNewCold, " verified:", okNew);
        console.log("delta (cold):", gOldCold - gNewCold);

        (uint256 gOldWarm,) = _measure(oldCode, true);
        (uint256 gNewWarm,) = _measure(newCode, true);
        console.log("--- SECOND (warm) access ---");
        console.log("old warm:", gOldWarm);
        console.log("new warm:", gNewWarm);
        console.log("delta (warm):", gOldWarm - gNewWarm);
        console.log("--- does the cold/warm choice change the DELTA? ---");
        console.log("delta_cold - delta_warm:",
            (gOldCold - gNewCold) > (gOldWarm - gNewWarm)
                ? (gOldCold - gNewCold) - (gOldWarm - gNewWarm)
                : (gOldWarm - gNewWarm) - (gOldCold - gNewCold));
        assertTrue(okOld && okNew, "both variants must verify the RFC6605 vector");
    }
}
