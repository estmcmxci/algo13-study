// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import "forge-std/Test.sol";
interface IAlg { function verify(bytes calldata k, bytes calldata d, bytes calldata s) external view returns (bool); }

/// Per-verification gas for each algorithm verifier CURRENTLY WIRED into the
/// production DNSSECImpl oracle 0x0fc31529..., measured at the deployed addresses.
contract AlgCosts is Test {
    address constant V_RSASHA256 = 0xaee0E2c4d5AB2fc164C8b0Cc8D3118C1c752C95E; // algorithms(8)
    address constant V_RSASHA1   = 0x58E0383E21f25DaB957F6664240445A514E9f5e8; // algorithms(5) and (7)
    address constant V_P256      = 0xB091C4F6FAc16eDDA5Ee1E0f4738f80011905878; // algorithms(13)

    // RFC 5702 vector (RSASHA256, 1024-bit modulus) from ens-contracts fixtures
    bytes RK = hex"0100030803010001c15c1ac6b1c5d822bae1a60a45489b2e21f7d0aa4fb8f0637a5ec4f19c9d416d476161dfa069a27730b6467870082dbdde10b3c3e4c54769ea9fc395498e6dd9";
    bytes RD = hex"0001080300000e1070dbd880386d43802349076578616d706c65036e65740003777777076578616d706c65036e6574000001000100000e100004c000025b";
    bytes RS = hex"91108e1fabbb974406cbdaa90bd975b0b9dc25c38a14b27b1a18943a26eee2d798a79544f519dcae24a164dcfce66c2532034469c1582bf94fb4f89560fe1bc2";
    // RFC 6605 vector (ECDSAP256SHA256)
    bytes PK = hex"0101030d1a88c88615d437fbb8bf9e1942a1929f28562706ae6c2bd399e7b1bfb6d1e9e75b92b4aa42917ae1c61b701ef035c3fe7be3009cbafe5a2f71316c902dcf0d00";
    bytes PD = hex"00010d0300000e104c88b1374c63c737d960076578616d706c65036e65740003777777076578616d706c65036e6574000001000100000e100004c0000201";
    bytes PS = hex"ab1eb02d8aa687e97da0229337aa8873e6f0eb26be289f28333d183f5d3b7a95c0c869adfb748daee3c5286eed6682c12e5533186baced9c26c167a9ebae950b";

    function _g(address v, bytes memory k, bytes memory d, bytes memory s) internal returns (uint256 g, bool ok) {
        IAlg(v).verify(k, d, s);                 // warm
        uint256 a = gasleft();
        ok = IAlg(v).verify(k, d, s);
        g = a - gasleft();
    }
    function test_wiredAlgorithmCosts() public {
        (uint256 g8, bool o8) = _g(V_RSASHA256, RK, RD, RS);
        (uint256 g13, bool o13) = _g(V_P256, PK, PD, PS);
        console.log("alg  8 RSASHA256 (1024-bit vector) gas:", g8, " verified:", o8);
        console.log("alg 13 ECDSAP256SHA256             gas:", g13, " verified:", o13);
        console.log("ratio alg8 / alg13:", g8 / g13);
        // determinism: repeat must be byte-identical
        (uint256 g8b,) = _g(V_RSASHA256, RK, RD, RS);
        (uint256 g13b,) = _g(V_P256, PK, PD, PS);
        assertEq(g8, g8b, "alg8 must be deterministic");
        assertEq(g13, g13b, "alg13 must be deterministic");
        assertTrue(o8 && o13, "both vectors must verify");
    }

    /// RSA gas scales with modulus size. Measure the modexp precompile (0x05)
    /// directly at the modulus sizes actually observed in the gTLD population.
    function test_modexpScaling() public view {
        uint16[4] memory bits = [uint16(1024), 1280, 2048, 4096];
        for (uint i = 0; i < 4; i++) {
            uint256 n = bits[i] / 8;
            bytes memory base = new bytes(n);
            bytes memory exp = hex"010001";
            bytes memory mod = new bytes(n);
            base[n-1] = 0x02; mod[0] = 0xC0; mod[n-1] = 0x01;
            bytes memory input = abi.encodePacked(uint256(n), uint256(exp.length), uint256(n), base, exp, mod);
            uint256 a = gasleft();
            (bool s,) = address(0x05).staticcall(input);
            uint256 g = a - gasleft();
            s;
            console.log("modexp modulus bits:", bits[i], " gas:", g);
        }
    }
}
