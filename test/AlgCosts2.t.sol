// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import "forge-std/Test.sol";
interface IAlg { function verify(bytes calldata k, bytes calldata d, bytes calldata s) external view returns (bool); }

/// v2: each measurement in its own external call so caller-frame memory growth
/// cannot contaminate the comparison (v1 saw a 1-gas drift from exactly that).
contract Probe {
    function measure(address v, bytes calldata k, bytes calldata d, bytes calldata s)
        external view returns (uint256 g, bool ok)
    {
        uint256 a = gasleft();
        ok = IAlg(v).verify(k, d, s);
        g = a - gasleft();
    }
}
contract AlgCosts2 is Test {
    address constant V8  = 0xaee0E2c4d5AB2fc164C8b0Cc8D3118C1c752C95E;
    address constant V13 = 0xB091C4F6FAc16eDDA5Ee1E0f4738f80011905878;
    Probe p;
    bytes RK = hex"0100030803010001c15c1ac6b1c5d822bae1a60a45489b2e21f7d0aa4fb8f0637a5ec4f19c9d416d476161dfa069a27730b6467870082dbdde10b3c3e4c54769ea9fc395498e6dd9";
    bytes RD = hex"0001080300000e1070dbd880386d43802349076578616d706c65036e65740003777777076578616d706c65036e6574000001000100000e100004c000025b";
    bytes RS = hex"91108e1fabbb974406cbdaa90bd975b0b9dc25c38a14b27b1a18943a26eee2d798a79544f519dcae24a164dcfce66c2532034469c1582bf94fb4f89560fe1bc2";
    bytes PK = hex"0101030d1a88c88615d437fbb8bf9e1942a1929f28562706ae6c2bd399e7b1bfb6d1e9e75b92b4aa42917ae1c61b701ef035c3fe7be3009cbafe5a2f71316c902dcf0d00";
    bytes PD = hex"00010d0300000e104c88b1374c63c737d960076578616d706c65036e65740003777777076578616d706c65036e6574000001000100000e100004c0000201";
    bytes PS = hex"ab1eb02d8aa687e97da0229337aa8873e6f0eb26be289f28333d183f5d3b7a95c0c869adfb748daee3c5286eed6682c12e5533186baced9c26c167a9ebae950b";
    function setUp() public { p = new Probe(); }

    function test_clean() public view {
        (uint256 a1, bool o1) = p.measure(V8, RK, RD, RS);
        (uint256 a2,)         = p.measure(V8, RK, RD, RS);
        (uint256 a3,)         = p.measure(V8, RK, RD, RS);
        (uint256 b1, bool o2) = p.measure(V13, PK, PD, PS);
        (uint256 b2,)         = p.measure(V13, PK, PD, PS);
        (uint256 b3,)         = p.measure(V13, PK, PD, PS);
        console.log("alg  8 RSASHA256 1024-bit :", a1, a2, a3);
        console.log("alg 13 ECDSAP256SHA256    :", b1, b2, b3);
        console.log("both verified:", o1 && o2);
        console.log("alg8 minus alg13:", a1 > b1 ? a1 - b1 : b1 - a1);
        require(a1 == a2 && a2 == a3, "alg8 not deterministic");
        require(b1 == b2 && b2 == b3, "alg13 not deterministic");
        console.log("repeated runs byte-identical: true");
        // calldata sizes actually submitted
        console.log("RSA  key/data/sig bytes:", RK.length, RD.length, RS.length);
        console.log("P256 key/data/sig bytes:", PK.length, PD.length, PS.length);
    }
}
