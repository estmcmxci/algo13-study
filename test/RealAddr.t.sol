// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import "forge-std/Test.sol";
interface IAlg { function verify(bytes calldata key, bytes calldata data, bytes calldata sig) external view returns (bool); }

/// Measure both verifiers AT THEIR REAL DEPLOYED ADDRESSES, no etch, to rule out
/// any state-override artifact in the paired measurement.
contract RealAddr is Test {
    IAlg constant OLD = IAlg(0x0faa24e538bA4620165933f68a9d142f79A68091);
    IAlg constant NEW = IAlg(0xB091C4F6FAc16eDDA5Ee1E0f4738f80011905878);
    bytes KEY = hex"0101030d1a88c88615d437fbb8bf9e1942a1929f28562706ae6c2bd399e7b1bfb6d1e9e75b92b4aa42917ae1c61b701ef035c3fe7be3009cbafe5a2f71316c902dcf0d00";
    bytes DATA= hex"00010d0300000e104c88b1374c63c737d960076578616d706c65036e65740003777777076578616d706c65036e6574000001000100000e100004c0000201";
    bytes SIG = hex"ab1eb02d8aa687e97da0229337aa8873e6f0eb26be289f28333d183f5d3b7a95c0c869adfb748daee3c5286eed6682c12e5533186baced9c26c167a9ebae950b";

    function test_realAddresses() public view {
        // warm both first so the comparison is like-for-like
        OLD.verify(KEY, DATA, SIG); NEW.verify(KEY, DATA, SIG);
        uint256 a = gasleft(); bool o = OLD.verify(KEY, DATA, SIG); uint256 gOld = a - gasleft();
        uint256 b = gasleft(); bool n = NEW.verify(KEY, DATA, SIG); uint256 gNew = b - gasleft();
        console.log("OLD 0x0faa24e5 (Solidity EC) gas:", gOld, " ok:", o);
        console.log("NEW 0xb091c4f6 (precompile)  gas:", gNew, " ok:", n);
        console.log("delta per verification:", gOld - gNew);
        console.log("PR #509 claims ~200000 -> ~3500, i.e. delta ~196500");
        console.log("ratio old/new:", gOld / gNew);
        assertTrue(o && n, "both must verify");
    }
}
